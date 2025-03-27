import slugifyLib from 'slugify';

/**
 * Extracts the first code snippet (e.g., JSON, JS, HTML) from a text block.
 * @param {string} text - The text containing the code block.
 * @returns {string} The extracted code snippet or the original text if no block is found.
 */
export const extractCodeSnippet = (text) => {
    const codeBlockRegex = /```(?:json|js|html|markdown)?\s*([\s\S]*?)\s*```/;
    const match = text.match(codeBlockRegex);
    return match ? match[1].trim() : text;
};

/**
 * Generates a URL-friendly slug from a given text.
 * @param {string} text - The text to slugify.
 * @returns {string} The generated slug.
 */
export const slugify = (text) => {
    if (!text) return '';
    return slugifyLib(text, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g
    });
};

/**
 * Extracts the client's IP address from the request headers.
 * Considers proxy headers like 'x-real-ip' and 'x-forwarded-for'.
 * @param {import('express').Request} req - The Express request object.
 * @returns {string} The client's IP address or an empty string if not found.
 */
export const getIpFromRequest = (req) => {
    if (!req) return '';
    const ips = (
        req.headers['x-real-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        ''
    ).split(',');
    return ips[0].trim();
};

/**
 * Simple utility to validate if a string is a valid URL.
 * @param {string} urlString - The string to validate.
 * @returns {boolean} True if the string is a valid URL, false otherwise.
 */
export const isValidUrl = (urlString) => {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
};

/**
 * Normalizes a URL string to a consistent format.
 * - Ensures http/https protocol.
 * - Removes trailing slash.
 * - Converts to lowercase.
 * - Removes www. prefix (optional, kept for now as it can matter for SEO)
 * @param {string} urlString - The URL string to normalize.
 * @returns {string | null} The normalized URL string or null if invalid.
 */
export const normalizeUrl = (urlString) => {
    if (!urlString) return null;

    let normalized = urlString.trim();

    // Ensure it has a protocol, default to http if missing
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `http://${normalized}`;
    }

    try {
        const url = new URL(normalized);

        // Remove trailing slash (unless it's just the domain)
        if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
            url.pathname = url.pathname.slice(0, -1);
        }

        // Convert hostname to lowercase
        url.hostname = url.hostname.toLowerCase();

        // Keep search params and hash for potential future use, but maybe normalize param order? Too complex for now.

        return url.toString();
    } catch (e) {
        console.error(`Error normalizing URL: ${urlString}`, e);
        return null; // Return null for invalid URLs
    }
};
