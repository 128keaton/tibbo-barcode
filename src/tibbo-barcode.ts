import { config } from 'dotenv';
import express from 'express';
import { join } from 'path';
import { TibboDiscover } from 'tibbo-discover';
import { request } from 'bwip-js';
import wkhtmltopdf from 'wkhtmltopdf';
import util from 'util';
import { exec as originalExec } from 'child_process';
import SimplDB, { Collection, Database } from 'simpl.db';
import { createReadStream } from 'fs';
import fs from 'fs';
const exec = util.promisify(originalExec);

type DeviceEntry = {
  mac: string;
  type: string;
};

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
      console.error('Could not generate PDF');
      console.error(err);
      return false;
    })
    .then(() => {
      return exec(`/usr/bin/lpr -P ${printer} ${outputPath}`);
    })
    .then(() => {
      return true;
    })
    .catch((err) => {
      console.error('Could not print barcode');
      console.error(err);
      return false;
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
        pageHeight: '0.75in',
        pageWidth: '1.00in',
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
 * Convert a device's ID to a MAC
 * @param deviceID
 */
const deviceToMac = (deviceID: string) => {
  return deviceID
    .replace('[', '')
    .replace(']', '')
    .split('.')
    .map((seq) => {
      if (seq === '000') return '0';

      return `${parseInt(String(seq))}`;
    })
    .join('.');
};

/**
 * Remove a device from the devices DB
 * @param devicesDB
 * @param mac
 */
const removeDevice = (
  devicesDB: SimplDB.Collection<SimplDB.Readable<DeviceEntry>>,
  mac: string,
) => {
  if (hasDevice(devicesDB, mac)) {
    devicesDB.remove((deviceEntry) => deviceEntry.mac === mac);
    devicesDB.save();
    return true;
  }

  return false;
};

/**
 * Check if the collection contains a device
 * @param devicesDB
 * @param mac
 */
const hasDevice = (
  devicesDB: SimplDB.Collection<SimplDB.Readable<DeviceEntry>>,
  mac: string,
) => {
  return devicesDB.has((deviceEntry) => deviceEntry.mac === mac);
};

/**
 * Process Tibbo devices
 * @param newDevices
 * @param devicesCollection
 * @param printer
 * @param port
 * @param allowDuplicates
 */
const processDevices = (
  newDevices: { board: string; id: string }[],
  devicesCollection: Collection<DeviceEntry>,
  printer: string,
  port: number,
  allowDuplicates: boolean,
) => {
  newDevices.forEach((device) => {
    const mac = deviceToMac(device.id);

    if (!hasDevice(devicesCollection, mac) || allowDuplicates) {
      const type = device.board
        .split('-')[0]
        .replace('(', '-')
        .replace(')', '');

      console.log('Printing label for', mac);
      printDeviceBarcode(type, mac, printer, port).then((success) => {
        if (success) {
          console.log('Printed label for', mac);
          devicesCollection.create({ mac, type });
        }
      });
    }
  });

  devicesCollection.save();
};

export const main = () => {
  // Import env
  config();

  // Environment
  const port = parseInt(process.env.APP_PORT || '8118');
  const scanTimeout = parseInt(process.env.SCAN_TIMEOUT || '5000');
  const interval = parseInt(process.env.INTERVAL || '10000');
  const printer = process.env.PRINTER || 'ZPL';
  const allowDuplicates =
    `${process.env.ALLOW_DUPLICATES || 'false'}` === 'true';

  const app = express();
  const router = express.Router();
  const db = new Database();
  const devicesDB = db.createCollection<DeviceEntry>('devices');

  // Configurations
  app.set('view engine', 'pug');
  app.set('views', join(process.env.PWD || __dirname, 'templates'));
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
    printDeviceBarcode('TPP2W-G2', '0.36.119.87.182.61', printer, port).then(
      (success) => {
        if (success) {
          const stream = createReadStream(outputPath);
          let filename = 'out.pdf';
          filename = encodeURIComponent(filename);

          res.setHeader(
            'Content-disposition',
            'inline; filename="' + filename + '"',
          );
          res.setHeader('Content-type', 'application/pdf');
          stream.pipe(res);
        }
      },
    );
  });

  router.get('/remove', (req, res) => {
    if (req.query.hasOwnProperty('mac') && !!req.query['mac']) {
      const mac = req.query['mac'];

      const didRemove = removeDevice(devicesDB, mac as string);

      if (didRemove)
        res.send({
          success: true,
          message: `Removed device with mac '${mac}' from database`,
        });
      else
        res.send({
          success: false,
        });
    } else {
      devicesDB.remove();
      devicesDB.save();
      res.send({ success: true, message: 'Removed all devices from database' });
    }
  });

  const scan = () => {
    const tibboDiscover = new TibboDiscover();

    tibboDiscover.scan(scanTimeout).then((devices) => {
      return processDevices(devices, devicesDB, printer, port, allowDuplicates);
    });
  };

  app.use('/', router);
  app.listen(port);

  console.clear();
  console.log(`Available at 0.0.0.0:${port}`);
  console.log(`Scanning every ${interval / 1000} seconds`);
  console.log(`PRINTER='${printer}'`);
  console.log(`ALLOW_DUPLICATES='${allowDuplicates}'`);

  setInterval(scan, interval);
  scan();
};

if (require.main == module) {
  main();
}
