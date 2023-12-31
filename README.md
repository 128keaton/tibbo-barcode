# tibbo-barcode

Install deps, create `.env`, build, and go!

### deps
* wkhtmltopdf
  * `wget https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/wkhtmltox_0.12.6.1-2.jammy_amd64.deb && sudo apt install -f ./wkhtmltox_0.12.6.1-2.jammy_amd64.deb`
* lpr
  * `sudo apt install cups-bsd`
* CUPS

### notes
Allow duplicates by specifying `ALLOW_DUPLICATES=true`
Specify CUPS printer name with `PRINTER`
Default port is 8118 and can be overridden with `APP_PORT`
Default scan interval is 10000ms and can be overridden with `INTERVAL`
Default scan timeout is 5000ms and can be overridden with `SCAN_TIMEOUT`

Default label size is `1.00x0.75"` and would need to be changed _manually_

### suggested usage

```shell
$ pm2 start dist/tibbo-barcode.js --name tibbo-barcode
```
