import { Router } from 'express';
import { createPDF } from './helpers';
import { request } from 'bwip-js';
import fs from 'fs';
import { Collection } from 'simpl.db';
import { Device } from './types/device';

export const setupRoutes = (
  router: Router,
  port: number,
  devicesDB: Collection<Device>,
) => {
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
        const stream = fs.createReadStream(outputPath);
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

      if (devicesDB.has((device) => device.id === deviceID)) {
        devicesDB.remove((device) => device.id === req.query['id']);
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
};
