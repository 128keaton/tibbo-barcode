import { config } from 'dotenv';
import express from 'express';
import { join } from 'path';
import { TibboDiscover } from 'tibbo-discover';
import { request } from 'bwip-js';
import wkhtmltopdf from 'wkhtmltopdf';
import util from 'util';
import { exec as originalExec } from 'child_process';
import { Collection, Database } from 'simpl.db';
import { createReadStream } from 'fs';
import fs from 'fs';
const exec = util.promisify(originalExec);

/**
 * Create a device barcode
 * @param type
 * @param mac
 * @param printer
 * @param port
 * @returns {Promise<string>}
 */
const printDeviceBarcode = (
  type: string,
  mac: string,
  printer: string,
  port: number,
) => {
  const outputPath = './generated/out.pdf';
  return createPDF(type, mac, port, outputPath)
    .catch((err) => {
      return err;
    })
    .then(() => {
      return exec(`/usr/bin/lpr -P ${printer} ${outputPath}`);
    });
};

/**
 * Create a barcode PDF
 * @param type
 * @param mac
 * @param port
 * @param output
 * @returns {Promise<unknown>}
 */
const createPDF = (type: string, mac: string, port: number, output: string) =>
  new Promise((resolve, reject) => {
    const file = fs.createWriteStream(output);
    const stream = wkhtmltopdf(
      `http://0.0.0.0:${port}/template?type=${type}&mac=${mac}`,
      {
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
        pageHeight: '1.25in',
        pageWidth: '2in',
        orientation: 'Portrait',
        disableSmartShrinking: true,
      },
      undefined,
    );

    stream.pipe(file);
    stream.on('end', resolve);
    stream.on('error', reject);
  });

/**
 * Process Tibbo devices
 * @param newDevices
 * @param devicesCollection
 * @param printer
 * @param port
 */
const processDevices = (
  newDevices: { board: string; id: string }[],
  devicesCollection: Collection<string>,
  printer: string,
  port: number,
) => {
  newDevices.forEach((device) => {
    if (!devicesCollection.has((deviceID) => deviceID === device.id)) {
      const { mac, type } = processDevice(device);
      devicesCollection.create(device.id);

      printDeviceBarcode(type, mac, printer, port)
        .catch((err) => {
          console.error('Unable to print barcode');
          console.log(err);
        })
        .then(() => {
          console.log('Printed label for', mac);
        });
    }
  });

  devicesCollection.save();
};

/**
 * Process Tibbo device
 * @param device
 */
const processDevice = (device: { board: string; id: string }) => {
  const type = device.board.split('-')[0].replace('(', '-').replace(')', '');
  const rawMac = device.id.replace('[', '').replace(']', '');

  const mac = rawMac
    .split('.')
    .map((seq) => {
      if (seq === '000') return '0';

      return `${parseInt(String(seq))}`;
    })
    .join('.');

  return { mac, type };
};

export const main = () => {
  // Import env
  config();

  // Environment
  const port = parseInt(process.env.APP_PORT || '8118');
  const scanTimeout = parseInt(process.env.SCAN_TIMEOUT || '5000');
  const interval = parseInt(process.env.INTERVAL || '10000');
  const printer = process.env.PRINTER || 'ZPL';

  const app = express();
  const router = express.Router();
  const tibboDiscover = new TibboDiscover();
  const db = new Database();
  const devicesDB = db.createCollection<string>('devices');

  // Configurations
  app.set('view engine', 'pug');
  app.set('views', join(__dirname, 'templates'));
  app.use(express.static('generated'));

  // Routes
  router.get('/barcode', (req, res) => {
    request(req, res);
  });

  router.get('/template', (req, res) => {
    res.render('template', req.query);
  });

  router.get('/test', (req, res) => {
    const outputPath = './generated/out.pdf';
    return createPDF('TPP2W-G2', '0.36.119.87.182.61', port, outputPath).then(
      () => {
        const stream = createReadStream(outputPath);
        let filename = 'out.pdf';
        filename = encodeURIComponent(filename);

        res.setHeader(
          'Content-disposition',
          'inline; filename="' + filename + '"',
        );
        res.setHeader('Content-type', 'application/pdf');
        stream.pipe(res);
      },
    );
  });

  router.get('/remove', (req, res) => {
    if (req.query.hasOwnProperty('id') && !!req.query['id']) {
      const deviceID = req.query['id'];

      if (devicesDB.has((deviceID) => deviceID === deviceID)) {
        devicesDB.remove((deviceID) => deviceID === req.query['id']);
        devicesDB.save();
        res.send({
          success: true,
          message: `Removed device with ID '${deviceID}' from database`,
        });
      }
    } else {
      devicesDB.remove();
      devicesDB.save();
      res.send({ success: true, message: 'Removed all devices from database' });
    }
  });

  function scan() {
    console.log('Scanning');
    tibboDiscover
      .scan(scanTimeout)
      .then((devices) => {
        return processDevices(devices, devicesDB, printer, port);
      })
      .then(() => {
        console.log(`Done! Next scan in ${interval / 1000} seconds`);
      });
  }

  app.use('/', router);
  app.listen(port);

  console.clear();
  console.log(`Available at 0.0.0.0:${port}`);
  console.log(`Scanning every ${interval / 1000} seconds`);
  console.log(`PRINTER='${printer}'`);
  setInterval(() => {
    scan();
  }, interval);
  scan();
};

if (require.main == module) {
  main();
}
