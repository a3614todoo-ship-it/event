// 信件寄送紀錄共用模組：攔截 EmailJS 與 GAS 寄信請求並寫入 Firestore。
(function () {
    const GAS_URL_MARKER = 'script.google.com/macros/s/';
    const MAX_ERROR_LENGTH = 500;

    function getDb() {
        try {
            if (!window.firebase || !firebase.apps || !firebase.apps.length) return null;
            return firebase.firestore();
        } catch (err) {
            return null;
        }
    }

    function getSource() {
        const path = window.location.pathname || '';
        if (path.includes('admin')) return 'admin';
        if (path.includes('payment')) return 'payment_page';
        if (path.includes('cancel')) return 'cancel_page';
        if (path.includes('details')) return 'registration_page';
        return 'frontend';
    }

    function inferTemplateKey(subject, htmlContent) {
        const text = `${subject || ''}\n${htmlContent || ''}`;
        if (/Payment Report Received|匯款回報|回報/.test(text)) return 'paymentReported';
        if (/Payment Confirmed|收款確認|繳費確認|正式報名成功/.test(text)) return 'paymentConfirmed';
        if (/Pending Payment|繳費通知|待繳費/.test(text)) return 'pendingPayment';
        if (/提醒|Reminder/.test(text)) return 'preEventReminder';
        if (/問卷|Survey/.test(text)) return 'surveyInvite';
        if (/取消|Cancellation/.test(text)) return 'cancelled';
        if (/候補|Waitlist|遞補/.test(text)) return 'waitlistPromoted';
        if (/報名成功|Registration Confirmed|Confirmed/.test(text)) return 'registered';
        return '';
    }

    function inferRegistrationId(htmlContent) {
        const text = String(htmlContent || '');
        const linkMatch = text.match(/(?:payment|cancel|survey)\.html\?id=([^"'&<\s]+)/);
        if (linkMatch) return decodeURIComponent(linkMatch[1]);
        const qrMatch = text.match(/[?&]chl=([^"'&<\s]+)/);
        if (qrMatch) return decodeURIComponent(qrMatch[1]);
        return '';
    }

    function normalizeEmailPayload(payload, extra) {
        const htmlContent = payload?.htmlContent || payload?.message_html || payload?.messageHtml || '';
        const subject = payload?.subject || extra?.subject || '';
        return {
            toEmail: String(payload?.toEmail || payload?.to_email || extra?.toEmail || ''),
            toName: String(payload?.toName || payload?.to_name || extra?.toName || ''),
            subject: String(subject || ''),
            source: extra?.source || getSource(),
            channel: extra?.channel || '',
            status: extra?.status || '',
            templateKey: extra?.templateKey || inferTemplateKey(subject, htmlContent),
            registrationId: extra?.registrationId || inferRegistrationId(htmlContent),
            eventId: extra?.eventId || '',
            eventName: extra?.eventName || '',
            errorMessage: extra?.errorMessage ? String(extra.errorMessage).slice(0, MAX_ERROR_LENGTH) : '',
            clientCreatedAt: new Date().toISOString(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    function writeEmailLog(payload, extra) {
        try {
            const db = getDb();
            if (!db) return;
            const data = normalizeEmailPayload(payload || {}, extra || {});
            if (!data.toEmail && !data.subject) return;
            db.collection('email_logs').add(data).catch(err => {
                console.warn('寫入信件寄送紀錄失敗，不影響寄信流程', err);
            });
        } catch (err) {
            console.warn('建立信件寄送紀錄失敗，不影響寄信流程', err);
        }
    }

    window.EmailSendLog = {
        write: writeEmailLog
    };

    if (window.emailjs && typeof window.emailjs.send === 'function' && !window.emailjs.__emailLogWrapped) {
        const originalSend = window.emailjs.send.bind(window.emailjs);
        window.emailjs.send = function (serviceId, templateId, params) {
            return originalSend(serviceId, templateId, params)
                .then(result => {
                    writeEmailLog(params, {
                        channel: 'emailjs',
                        status: 'sent',
                        templateKey: params?.templateKey || '',
                        source: getSource()
                    });
                    return result;
                })
                .catch(err => {
                    writeEmailLog(params, {
                        channel: 'emailjs',
                        status: 'failed',
                        errorMessage: err?.message || err,
                        source: getSource()
                    });
                    throw err;
                });
        };
        window.emailjs.__emailLogWrapped = true;
    }

    if (window.fetch && !window.fetch.__emailLogWrapped) {
        const originalFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const bodyText = init && typeof init.body === 'string' ? init.body : '';
            const shouldTrackGas = url.includes(GAS_URL_MARKER) && bodyText.includes('toEmail');
            let payload = null;

            if (shouldTrackGas) {
                try {
                    payload = JSON.parse(bodyText);
                } catch (err) {
                    payload = null;
                }
            }

            return originalFetch(input, init)
                .then(response => {
                    if (shouldTrackGas && payload) {
                        writeEmailLog(payload, {
                            channel: 'gas',
                            status: 'requested',
                            source: getSource()
                        });
                    }
                    return response;
                })
                .catch(err => {
                    if (shouldTrackGas && payload) {
                        writeEmailLog(payload, {
                            channel: 'gas',
                            status: 'failed',
                            errorMessage: err?.message || err,
                            source: getSource()
                        });
                    }
                    throw err;
                });
        };
        window.fetch.__emailLogWrapped = true;
    }
})();
