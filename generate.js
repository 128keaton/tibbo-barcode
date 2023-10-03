require('dotenv').config();

// Requirements
const path = require("path");
const fs = require('fs');
const wkhtmltopdf = require('wkhtmltopdf')
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const bwipjs = require('bwip-js');
const express = require("express");
const {TibboDiscover} = require("tibbo-discover");

// Environment
const port = parseInt(process.env.APP_PORT) || 8118;
const interval = parseInt(process.env.INTERVAL) || 10000;
const printer = process.env.PRINTER;

// Variables
const app = express();
const router = express.Router();
const printed = [];
const tibboDiscover = new TibboDiscover();

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
    return createPDF(type, mac, port, outputPath).catch((err) => {
        return err;
    }).then(() => {
        return exec(`/usr/bin/lpr -P ${printer} ${outputPath}`)
    })
}

/**
 * Create a barcode PDF
 * @param type
 * @param mac
 * @param port
 * @param output
 * @returns {Promise<unknown>}
 */
const createPDF = (type, mac, port, output) => new Promise((resolve, reject) => {
    const file = fs.createWriteStream(output);
    const stream = wkhtmltopdf(`http://0.0.0.0:${port}/template?type=${type}&mac=${mac}`, {
        "margin-top": 0,
        "margin-bottom": 0,
        "margin-left": 0,
        "margin-right": 0,
        'page-height': '1.25in',
        'page-width': '2in',
        'orientation': 'portrait',
        'disable-smart-shrinking': true
    });

    stream.pipe(file);
    stream.on('end', resolve);
    stream.on('error', reject);
})


/**
 * Scan for Tibbo devices
 */
const scan = () => {
    tibboDiscover.scan().then(devices => {
        devices.forEach(device => {
            if (!printed.includes(device.id)) {
                const type = device.board.split('-')[0].replace('(', '-').replace(')', '');
                const rawMac = device.id.replace('[', '').replace(']', '');

                const mac = rawMac.split('.').map(seq => {
                    if (seq === '000')
                        return '0';

                    return `${parseInt(String(seq))}`
                }).join('.');


                printed.push(device.id);
                printDeviceBarcode(type, mac, printer, port).catch(err => {
                    console.error('Unable to print barcode');
                    console.log(err);
                }).then(() => {
                    console.log('Printed label for', mac);
                })
            }
        })
    })
}


// Configurations
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "templates"));
app.use(express.static('generated'))

router.get('/barcode', (req, res) => {
    bwipjs.request(req, res);
});

router.get("/template", (req, res) => {
    res.render("template", req.query);
});

router.get('/test', (req, res) => {
    const outputPath = './generated/out.pdf';
    return createPDF('TEST_TYPE', 'MAC_ADDRESS_DADDY', port, outputPath).then(() => {
        const stream = fs.createReadStream(outputPath);
        let filename = "out.pdf";
        filename = encodeURIComponent(filename);

        res.setHeader('Content-disposition', 'inline; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');
        stream.pipe(res);
    });
})

app.use("/", router);

app.listen(port);

setInterval(scan, interval);
scan();
