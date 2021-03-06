/**
 * Utility methods
 */
const Backoff = require('backo2');
const debug = require('debug')('acme-client');
const forge = require('./crypto/forge');


/**
 * Retry promise
 *
 * @param {function} fn Function returning promise that should be retried
 * @param {number} attempts Maximum number of attempts
 * @param {Backoff} backoff Backoff instance
 * @returns {Promise}
 */

async function retryPromise(fn, attempts, backoff) {
    let aborted = false;

    try {
        const data = await fn(() => { aborted = true; });
        return data;
    }
    catch (e) {
        if (aborted || ((backoff.attempts + 1) >= attempts)) {
            throw e;
        }

        const duration = backoff.duration();
        debug(`Promise rejected attempt #${backoff.attempts}, retrying in ${duration}ms: ${e.message}`);

        await new Promise((resolve) => setTimeout(resolve, duration));
        return retryPromise(fn, attempts, backoff);
    }
}


/**
 * Retry promise
 *
 * @param {function} fn Function returning promise that should be retried
 * @param {object} [backoffOpts] Backoff options
 * @param {number} [backoffOpts.attempts] Maximum number of attempts, default: `5`
 * @param {number} [backoffOpts.min] Minimum attempt delay in milliseconds, default: `5000`
 * @param {number} [backoffOpts.max] Maximum attempt delay in milliseconds, default: `30000`
 * @returns {Promise}
 */

function retry(fn, { attempts = 5, min = 5000, max = 30000 } = {}) {
    const backoff = new Backoff({ min, max });
    return retryPromise(fn, attempts, backoff);
}


/**
 * Escape base64 encoded string
 *
 * @param {string} str Base64 encoded string
 * @returns {string} Escaped string
 */

function b64escape(str) {
    return str.replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}


/**
 * Base64 encode and escape buffer or string
 *
 * @param {buffer|string} str Buffer or string to be encoded
 * @returns {string} Escaped base64 encoded string
 */

function b64encode(str) {
    const buf = Buffer.isBuffer(str) ? str : Buffer.from(str);
    return b64escape(buf.toString('base64'));
}


/**
 * Parse URLs from link header
 *
 * @param {string} header Link header contents
 * @param {string} rel Link relation, default: `alternate`
 * @returns {array} Array of URLs
 */

function parseLinkHeader(header, rel = 'alternate') {
    const relRe = new RegExp(`\\s*rel\\s*=\\s*"?${rel}"?`, 'i');

    const results = (header || '').split(/,\s*</).map((link) => {
        const [, linkUrl, linkParts] = link.match(/<?([^>]*)>;(.*)/) || [];
        return (linkUrl && linkParts && linkParts.match(relRe)) ? linkUrl : null;
    });

    return results.filter((r) => r);
}

/**
 * Find certificate chain with preferred issuer
 * If issuer can not be located, the first certificate will be returned
 *
 * @param {array} chains Array of PEM encoded certificate chains
 * @param {string} issuer Preferred certificate issuer
 * @returns {Promise<string>} PEM encoded certificate chain
 */

async function findCertificateChainForIssuer(chains, issuer) {
    // eslint-disable-next-line no-restricted-syntax
    for (const chain of chains) {
        const certs = forge.splitPemChain(chain);
        // eslint-disable-next-line no-restricted-syntax
        for (const cert of certs) {
            // eslint-disable-next-line no-await-in-loop
            const i = await forge.readCertificateInfo(cert);
            if (i.issuer.commonName === issuer) {
                return chain;
            }
        }
    }
    debug(`Found no match in ${chains.length} certificate chains for preferred issuer="${issuer}", returning default certificate chain`);
    return chains[0];
}


/**
 * Find and format error in response object
 *
 * @param {object} resp HTTP response
 * @returns {string} Error message
 */

function formatResponseError(resp) {
    let result;

    if (resp.data.error) {
        result = resp.data.error.detail || resp.data.error;
    }
    else {
        result = resp.data.detail || JSON.stringify(resp.data);
    }

    return result.replace(/\n/g, '');
}


/* Export utils */
module.exports = {
    retry,
    b64escape,
    b64encode,
    parseLinkHeader,
    findCertificateChainForIssuer,
    formatResponseError
};
