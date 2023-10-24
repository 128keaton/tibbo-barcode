"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const dotenv_1 = require("dotenv");
const express_1 = __importDefault(require("express"));
const path_1 = require("path");
const tibbo_discover_1 = require("tibbo-discover");
const bwip_js_1 = require("bwip-js");
const wkhtmltopdf_1 = __importDefault(require("wkhtmltopdf"));
const util_1 = __importDefault(require("util"));
const child_process_1 = require("child_process");
const simpl_db_1 = require("simpl.db");
const fs_1 = require("fs");
const fs_2 = __importDefault(require("fs"));
const exec = util_1.default.promisify(child_process_1.exec);
/**
 * Create a device barcode
 * @param type
 * @param mac
 * @param printer
 * @param port
 * @returns {Promise<string>}
 */
const printDeviceBarcode = (type, mac, printer, port) => {
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
const createPDF = (type, mac, port, output) => new Promise((resolve, reject) => {
    const file = fs_2.default.createWriteStream(output);
    const stream = (0, wkhtmltopdf_1.default)(`http://0.0.0.0:${port}/template?type=${type}&mac=${mac}`, {
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
        pageHeight: '0.75in',
        pageWidth: '1.00in',
        orientation: 'Portrait',
        disableSmartShrinking: true,
    }, undefined);
    stream.pipe(file);
    stream.on('end', resolve);
    stream.on('error', reject);
});
/**
 * Convert a device's ID to a MAC
 * @param deviceID
 */
const deviceToMac = (deviceID) => {
    return deviceID
        .replace('[', '')
        .replace(']', '')
        .split('.')
        .map((seq) => {
        if (seq === '000')
            return '0';
        return `${parseInt(String(seq))}`;
    })
        .join('.');
};
/**
 * Remove a device from the devices DB
 * @param devicesDB
 * @param mac
 */
const removeDevice = (devicesDB, mac) => {
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
const hasDevice = (devicesDB, mac) => {
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
const processDevices = (newDevices, devicesCollection, printer, port, allowDuplicates) => {
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
const main = () => {
    // Import env
    (0, dotenv_1.config)();
    // Environment
    const port = parseInt(process.env.APP_PORT || '8118');
    const scanTimeout = parseInt(process.env.SCAN_TIMEOUT || '5000');
    const interval = parseInt(process.env.INTERVAL || '10000');
    const printer = process.env.PRINTER || 'ZPL';
    const allowDuplicates = `${process.env.ALLOW_DUPLICATES || 'false'}` === 'true';
    const app = (0, express_1.default)();
    const router = express_1.default.Router();
    const db = new simpl_db_1.Database();
    const devicesDB = db.createCollection('devices');
    // Configurations
    app.set('view engine', 'pug');
    app.set('views', (0, path_1.join)(process.env.PWD || __dirname, 'templates'));
    app.use(express_1.default.static('generated'));
    // Routes
    router.get('/barcode', (req, res) => {
        (0, bwip_js_1.request)(req, res);
    });
    router.get('/template', (req, res) => {
        res.render('template', req.query);
    });
    router.get('/test', (req, res) => {
        const outputPath = './generated/out.pdf';
        printDeviceBarcode('TPP2W-G2', '0.36.119.87.182.61', printer, port).then((success) => {
            if (success) {
                const stream = (0, fs_1.createReadStream)(outputPath);
                let filename = 'out.pdf';
                filename = encodeURIComponent(filename);
                res.setHeader('Content-disposition', 'inline; filename="' + filename + '"');
                res.setHeader('Content-type', 'application/pdf');
                stream.pipe(res);
            }
        });
    });
    router.get('/remove', (req, res) => {
        if (req.query.hasOwnProperty('mac') && !!req.query['mac']) {
            const mac = req.query['mac'];
            const didRemove = removeDevice(devicesDB, mac);
            if (didRemove)
                res.send({
                    success: true,
                    message: `Removed device with mac '${mac}' from database`,
                });
            else
                res.send({
                    success: false,
                });
        }
        else {
            devicesDB.remove();
            devicesDB.save();
            res.send({ success: true, message: 'Removed all devices from database' });
        }
    });
    const scan = () => {
        const tibboDiscover = new tibbo_discover_1.TibboDiscover();
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
exports.main = main;
if (require.main == module) {
    (0, exports.main)();
}
