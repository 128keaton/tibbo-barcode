import * as fs from 'fs';
import wkhtmltopdf from 'wkhtmltopdf';
import util from 'util';
import { exec as originalExec } from 'child_process';
import { TibboDevice } from 'tibbo-discover/dist';
import { Collection, Database } from 'simpl.db';
import { Device } from './types/device';
const exec = util.promisify(originalExec);

export const setupDatabase = () => {
  const db = new Database();
  return db.createCollection<Device>('devices');
};

/**
 * Create a device barcode
 * @param type
 * @param mac
 * @param printer
 * @param port
 * @returns {Promise<string>}
 */
export const printDeviceBarcode = (
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
export const createPDF = (
  type: string,
  mac: string,
  port: number,
  output: string,
) =>
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
export const processDevices = (
  newDevices: TibboDevice[],
  devicesCollection: Collection<Device>,
  printer: string,
  port: number,
) => {
  newDevices.forEach((device) => {
    if (
      !devicesCollection.has(
        (existingDevice) => existingDevice.id === device.id,
      )
    ) {
      const { mac, type } = processDevice(device);
      devicesCollection.create({ id: device.id });

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
export const processDevice = (device: TibboDevice) => {
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
