# tibbo-barcode

Install deps, create `.env`, build, and go!

### deps
* wkhtmltopdf
* lpr
* CUPS

### notes
Specify CUPS printer name with `PRINTER`
Default port is 8118 and can be overridden with `APP_PORT`
Default scan interval is 10000ms and can be overridden with `INTERVAL`

### suggested usage

```shell
$ pm2 start dist/tibbo-barcode.js --name tibbo-barcode
```
