var cordova = cordova || false;
var myApp = new Framework7({
    swipeBackPage: false
});

Template7.registerHelper('toFixed', function(value, options) {
    var value = parseFloat(value);

    if (isNaN(value))
        console.error('Wrong toFixed helper input');

    options.length = options.length || 2;

    return value.toFixed(options.length);
});

var VoucherService = function(configs) {
    this.configs = configs;
};

VoucherService.prototype.loadVoucher = function(voucher_code) {
    return $.get(
        this.configs.api_host + '/app/voucher/' + voucher_code);
};

VoucherService.prototype.doTransfer = function(voucher_code, data) {
    data['_method'] = 'PUT';

    return $.ajax({
        url: this.configs.api_host + '/app/voucher/' + voucher_code,
        data: data,
        type: 'POST',
        dataType: "json",
        accepts: {
            text: "application/json"
        }
    });
};

var QrScannerService = function(scanner_settings) {
    this.scanner_settings = scanner_settings;
};

QrScannerService.prototype.scanVoucher = function(success, fail) {
    cordova.plugins.barcodeScanner.scan(
        success,
        fail,
        this.scanner_settings)
};

var qr_scanner_service = new QrScannerService({
    preferFrontCamera: false,
    showFlipCameraButton: false,
    showTorchButton: false,
    torchOn: false,
    saveHistory: false,
    prompt: "Plaats een QR-code in het vierkant",
    resultDisplayDuration: 100,
    formats: "QR_CODE",
    orientation: "portrait",
    disableAnimations: true,
    disableSuccessBeep: true
});

var voucher_service = new VoucherService({
    api_host: !cordova ? 'http://127.0.0.1:8000' : 'http://mvp.forus.io'
});

mainView = myApp.addView('.view-main');

myApp.onPageInit('voucher-info', function(page) {
    var compiled = Template7.compile($(page.container).html());

    $(page.container).html(compiled({
        voucher: page.query
    }));

    if (page.query.max_amount <= 0)
        $(page.container).find('[voucher-form]').css('display', 'none');

    var form_root = $(page.container).find('[voucher-form]');
    var submit_button = form_root.find('[submit-btn]');
    var errors_root = form_root.find('[validation-errors]');

    var pending = false;

    var proceedErrors = function(errors) {
        var _errors = '';

        Object.values(errors).map(function(error) {
            _errors += '<p class="text-danger">' + error + '</p>'
        });

        errors_root.html(_errors);
    };

    var proceedSuccess = function(data) {
        $(page.container).find('.page-content, .navbar .left, .navbar .right').html('');

        var modal = myApp.modal({
            text: $('#success_modal').html(),
            close: true,
        });

        $(modal).find('[modal-dismiss]').unbind('click').bind('click', function(e) {
            myApp.closeModal();
        });
    };

    submit_button.unbind('click').bind('click', function(e) {
        e.preventDefault() & e.stopPropagation();

        if (pending)
            return;

        var data = {};

        form_root.find('input').each(function() {
            if ($(this).attr('type') == 'checkbox')
                return data[$(this).attr('name')] = $(this).prop('checked') ? $(this).val() : 0;

            data[$(this).attr('name')] = $(this).val();
        });

        data.full_amount = '0';

        pending = true;

        var promise = voucher_service.doTransfer(page.query.code, data);

        promise.then(function(data) {
            pending = false;
            proceedErrors([]);
            proceedSuccess(data);
        }, function(response) {
            pending = false;
            proceedErrors(JSON.parse(response.responseText));
        });

        console.log(data);
    });
});

myApp.onPageInit('scan-qr-code-fail', function(page) {
    $(page.container).find('[info]').text(page.query.info);
});

myApp.onPageInit('scan-qr-code', function(page) {
    var failResolver = function(info) {
        mainView.router.loadPage({
            url: './pages/scan-qr-code-fail.html',
            query: {
                info: info
            }
        });
    }

    var successResolver = function(response) {
        mainView.router.loadPage({
            url: './pages/voucher-info.html',
            query: response
        });
    }

    var processVoucher = function(qr_code) {
        if (!qr_code)
            return failResolver('Can\'t get or decode QR-Code.');

        voucher_service.loadVoucher(qr_code).then(function(data) {
            if (!data.success || !data.response)
                return failResolver(data.info);

            successResolver(data.response);
        }, function(response) {
            failResolver('De QR-code is niet herkend.');
        });
    };

    if (!cordova || !cordova.plugins.barcodeScanner) {
        return setTimeout(function() {
            processVoucher('VIES-2F9M-J8RR-TC5W');
        }, 1000);
    }

    qr_scanner_service.scanVoucher(function(result) {
        processVoucher(result.cancelled ? false : result.text);
    }, function(error) {
        processVoucher(false);
    });
});

mainView.router.loadPage('./pages/index.html');