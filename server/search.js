import { load } from 'cheerio';
import { Router } from 'express';
import fetch from 'node-fetch'; // Assuming node-fetch or using built-in fetch if Node >= 18
import { authenticateToken } from './middleware/auth.js';
import Report from './models/Report.js'; // Import the Report model

// --- Constants ---

const FETCH_TIMEOUT = 15000; // 15 seconds
const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5 MB limit for fetched content

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36'
];

const router = Router();

// --- Helper Functions ---

const getRandomUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

/**
 * Fetches and parses the HTML content of a given URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<{html: string, $: cheerio.CheerioAPI, finalUrl: string, status: number, error?: string }>} - Parsed content or error.
 */
const fetchAndParseUrl = async (url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    let response;

    try {
        // Ensure URL has a protocol
        let fetchUrl = url;
        if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
            fetchUrl = 'http://' + fetchUrl; // Default to http, redirects will handle https
        }

        response = await fetch(fetchUrl, {
            headers: { 'User-Agent': getRandomUserAgent(), Accept: 'text/html,*/*' },
            signal: controller.signal,
            redirect: 'follow', // Follow redirects
            size: MAX_CONTENT_SIZE // Limit response size (node-fetch specific)
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return { error: `HTTP error! Status: ${response.status}`, status: response.status };
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
            return {
                error: `Invalid content type: ${contentType || 'Not specified'}. Expected text/html.`,
                status: response.status
            };
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_SIZE) {
            return {
                error: `Declared content length exceeds size limit of ${MAX_CONTENT_SIZE / (1024 * 1024)} MB`,
                status: 413
            };
        }

        const htmlBuffer = await response.buffer(); // Read as buffer first for size check
        if (htmlBuffer.byteLength > MAX_CONTENT_SIZE) {
            return {
                error: `Downloaded content exceeds size limit of ${MAX_CONTENT_SIZE / (1024 * 1024)} MB`,
                status: 413
            };
        }

        const html = htmlBuffer.toString('utf8'); // Decode buffer
        const $ = load(html);
        return { html, $, finalUrl: response.url, status: response.status };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return {
                error: `Request timed out after ${FETCH_TIMEOUT / 1000} seconds`,
                status: 408
            };
        }
        if (error.type === 'max-size') {
            return {
                error: `Content exceeds size limit of ${MAX_CONTENT_SIZE / (1024 * 1024)} MB`,
                status: 413
            };
        }
        // Handle specific DNS errors etc.
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
            return { error: `Could not resolve domain name: ${url}`, status: 404 };
        }
        console.error(`Fetch error for ${url}:`, error);
        return { error: `Failed to fetch URL: ${error.message}`, status: 500 };
    }
};

/**
 * Checks for the existence and accessibility of robots.txt.
 * @param {URL} siteUrl - The base URL of the site.
 * @returns {Promise<{exists: boolean, content?: string, error?: string}>}
 */
const checkRobotsTxt = async (siteUrl) => {
    const robotsUrl = new URL('/robots.txt', siteUrl.origin).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT / 2);

    try {
        const response = await fetch(robotsUrl, {
            headers: { 'User-Agent': getRandomUserAgent() },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const content = await response.text();
            // Basic check for common disallow rules, could be expanded
            const disallowedAll = /User-agent:\s*\*\s*Disallow:\s*\/$/m.test(content);
            return { exists: true, content: content.slice(0, 5000), disallowedAll };
        } else if (response.status === 404) {
            return { exists: false };
        } else {
            return {
                exists: false,
                error: `robots.txt check failed with status: ${response.status}`
            };
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return { exists: false, error: 'robots.txt check timed out' };
        }
        return { exists: false, error: `Error checking robots.txt: ${error.message}` };
    }
};

/**
 * Checks for the existence and accessibility of sitemap.xml (common locations).
 * @param {URL} siteUrl - The base URL of the site.
 * @param {object} robotsAnalysis - Result from checkRobotsTxt.
 * @returns {Promise<{exists: boolean, url?: string, error?: string}>}
 */
const checkSitemap = async (siteUrl, robotsAnalysis) => {
    const potentialSitemapUrls = new Set(); // Use Set to avoid duplicates
    potentialSitemapUrls.add(new URL('/sitemap.xml', siteUrl.origin).toString());
    potentialSitemapUrls.add(new URL('/sitemap_index.xml', siteUrl.origin).toString()); // Common variation

    // Check robots.txt for Sitemap directive(s)
    if (robotsAnalysis.exists && robotsAnalysis.content) {
        const sitemapMatches = robotsAnalysis.content.matchAll(/Sitemap:\s*(.*)/gi);
        for (const match of sitemapMatches) {
            if (match[1]) {
                try {
                    // Resolve relative URLs from robots.txt
                    const sitemapUrl = new URL(match[1].trim(), siteUrl.origin).toString();
                    potentialSitemapUrls.add(sitemapUrl);
                } catch {
                    console.warn(`Invalid sitemap URL found in robots.txt: ${match[1].trim()}`);
                }
            }
        }
    }

    for (const sitemapUrl of potentialSitemapUrls) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT / 2);
        try {
            // Try HEAD first
            let response = await fetch(sitemapUrl, {
                method: 'HEAD',
                headers: { 'User-Agent': getRandomUserAgent() },
                signal: controller.signal,
                redirect: 'follow'
            });

            // If HEAD fails (e.g., 405 Method Not Allowed), try GET
            if (!response.ok && (response.status === 405 || response.status === 501)) {
                clearTimeout(timeoutId); // Reset timeout for GET
                const getController = new AbortController();
                const getTimeoutId = setTimeout(() => getController.abort(), FETCH_TIMEOUT / 2);
                response = await fetch(sitemapUrl, {
                    method: 'GET',
                    headers: { 'User-Agent': getRandomUserAgent() },
                    signal: getController.signal,
                    redirect: 'follow'
                });
                clearTimeout(getTimeoutId);
            } else {
                clearTimeout(timeoutId);
            }

            if (response.ok) {
                // Optional: Check content-type for XML
                const contentType = response.headers.get('content-type');
                if (contentType && (contentType.includes('xml') || contentType.includes('text'))) {
                    return { exists: true, url: sitemapUrl };
                } else {
                    console.warn(
                        `Sitemap found at ${sitemapUrl} but has unexpected content type: ${contentType}`
                    );
                    // Decide if this should count as existing or not
                    // return { exists: true, url: sitemapUrl, warning: `Unexpected content type: ${contentType}` };
                }
            }
        } catch (error) {
            clearTimeout(timeoutId); // Ensure timeout cleared on error
            if (error.name === 'AbortError') {
                console.warn(`Sitemap check timed out for ${sitemapUrl}`);
                // Continue to next potential URL
            } else {
                console.warn(`Error checking sitemap ${sitemapUrl}: ${error.message}`);
                // Continue checking other potential URLs
            }
        }
    }

    return { exists: false, error: 'Sitemap not found in common locations or robots.txt' };
};

// --- Analysis Functions ---

const analyzeMetaTags = ($) => {
    const title = $('head > title').text().trim();
    const description = $('meta[name="description"]').attr('content')?.trim() || null;
    const keywords = $('meta[name="keywords"]').attr('content')?.trim() || null; // Less important nowadays
    const viewport = $('meta[name="viewport"]').attr('content')?.trim() || null;
    const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
    const robots = $('meta[name="robots"]').attr('content')?.trim() || null; // Check meta robots tag
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
    const ogDescription = $('meta[property="og:description"]').attr('content')?.trim() || null;
    const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;
    const ogUrl = $('meta[property="og:url"]').attr('content')?.trim() || null;
    const twitterCard = $('meta[name="twitter:card"]').attr('content')?.trim() || null;
    const twitterTitle = $('meta[name="twitter:title"]').attr('content')?.trim() || null;
    const twitterDescription =
        $('meta[name="twitter:description"]').attr('content')?.trim() || null;
    const twitterImage = $('meta[name="twitter:image"]').attr('content')?.trim() || null;

    return {
        title: { value: title, length: title.length },
        description: { value: description, length: description?.length || 0 },
        keywords: { value: keywords }, // Keep for info, but low impact score-wise
        viewport: { value: viewport },
        canonical: { value: canonical },
        robots: { value: robots },
        openGraph: {
            title: ogTitle || title, // Fallback to main title
            description: ogDescription || description, // Fallback to main description
            image: ogImage,
            url: ogUrl || canonical // Fallback to canonical
        },
        twitterCard: {
            card: twitterCard,
            title: twitterTitle || ogTitle || title, // Fallback chain
            description: twitterDescription || ogDescription || description, // Fallback chain
            image: twitterImage || ogImage // Fallback chain
        }
    };
};

const analyzeHeadings = ($) => {
    const headings = {};
    let totalHeadings = 0;
    const h1s = [];
    for (let i = 1; i <= 6; i++) {
        const tag = `h${i}`;
        headings[tag] = [];
        $(tag).each((_, element) => {
            const text = $(element).text().trim();
            if (text) {
                headings[tag].push(text);
                totalHeadings++;
                if (i === 1) {
                    h1s.push(text);
                }
            }
        });
    }
    return {
        structure: headings,
        total: totalHeadings,
        h1Count: h1s.length,
        h1Content: h1s
    };
};

const analyzeImages = ($) => {
    const images = [];
    let missingAltCount = 0;
    let presentationalAltCount = 0; // alt=""
    let decorativeImages = 0; // Heuristic: small images might be decorative
    const MIN_DIMENSION_FOR_CONTENT = 50; // Pixels (adjust as needed)

    $('img').each((_, element) => {
        const src = $(element).attr('src');
        const alt = $(element).attr('alt');
        const width = $(element).attr('width') || $(element).css('width');
        const height = $(element).attr('height') || $(element).css('height');

        if (src) {
            const isMissingAlt = alt === undefined || alt === null;
            const isPresentationalAlt = alt !== undefined && alt !== null && alt.trim() === '';
            let isLikelyDecorative = false;

            // Basic check for small dimensions (if available)
            const w = parseInt(width, 10);
            const h = parseInt(height, 10);
            if (
                (!isNaN(w) && w < MIN_DIMENSION_FOR_CONTENT) ||
                (!isNaN(h) && h < MIN_DIMENSION_FOR_CONTENT)
            ) {
                isLikelyDecorative = true;
                decorativeImages++;
            }

            images.push({
                src,
                alt: alt === undefined || alt === null ? null : alt, // Store null if missing, "" if presentational
                width: !isNaN(w) ? w : null,
                height: !isNaN(h) ? h : null,
                missingAlt: isMissingAlt,
                presentationalAlt: isPresentationalAlt,
                likelyDecorative: isLikelyDecorative
            });

            if (isMissingAlt) {
                missingAltCount++;
            }
            if (isPresentationalAlt) {
                presentationalAltCount++;
            }
        }
    });
    return {
        images,
        count: images.length,
        missingAltCount,
        presentationalAltCount,
        likelyDecorativeCount: decorativeImages
    };
};

const analyzeContent = ($, html) => {
    // Remove script, style, noscript, svg, header, footer, nav, aside before text extraction
    $(
        'script, style, noscript, svg, header, footer, nav, aside, form, button, input, select, textarea'
    ).remove();
    const bodyText = $('body').text() || '';
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length; // More robust split

    // Placeholder for text-to-HTML ratio (requires original HTML length)
    const htmlLength = Buffer.byteLength(html || '', 'utf8');
    const textLength = Buffer.byteLength(cleanText, 'utf8');
    const textHtmlRatio = htmlLength > 0 ? (textLength / htmlLength) * 100 : 0;

    // Placeholder for readability/keyword density - requires more complex libraries or AI
    return {
        wordCount,
        textHtmlRatio: parseFloat(textHtmlRatio.toFixed(2))
        // keywordDensity: {},
        // readabilityScore: null,
    };
};

const checkHttps = (finalUrl) => {
    try {
        const parsedUrl = new URL(finalUrl);
        return { usesHttps: parsedUrl.protocol === 'https:', finalUrl };
    } catch (e) {
        // This should ideally not happen if fetchAndParseUrl succeeded
        console.error('Error parsing final URL in checkHttps:', finalUrl, e);
        return { usesHttps: false, error: 'Invalid final URL', finalUrl };
    }
};

const checkMobileFriendliness = ($) => {
    const viewport = $('meta[name="viewport"]').attr('content');
    const hasViewport = !!viewport;
    // Basic check for common viewport properties
    const hasWidthDeviceWidth = viewport ? viewport.includes('width=device-width') : false;
    const hasInitialScale = viewport ? viewport.includes('initial-scale=1') : false;

    // Check for flash content (mostly obsolete but still a negative signal)
    const hasFlash =
        $('object[type*="shockwave-flash"], embed[type*="shockwave-flash"]').length > 0;

    // Check for legible font sizes (heuristic - very basic)
    // let smallFontElements = 0;
    // $('p, span, div, li').each((_, el) => {
    //     const fontSize = $(el).css('font-size');
    //     if (fontSize && parseFloat(fontSize) < 12) { // Example threshold
    //         smallFontElements++;
    //     }
    // });

    return {
        hasViewportMeta: hasViewport,
        viewportContent: viewport || null,
        hasWidthDeviceWidth: hasWidthDeviceWidth,
        hasInitialScale: hasInitialScale,
        usesFlash: hasFlash
        // smallFontElements: smallFontElements > 5 ? 'Potential issue' : 'OK' // Example metric
    };
};

const checkSchemaMarkup = ($) => {
    const scripts = $('script[type="application/ld+json"]');
    const schemaData = [];
    let hasSchema = false;
    let parseErrors = 0;
    scripts.each((_, element) => {
        try {
            const scriptContent = $(element).html();
            if (scriptContent) {
                const parsedJson = JSON.parse(scriptContent);
                schemaData.push(parsedJson); // Store parsed JSON
                hasSchema = true;
            }
        } catch (e) {
            parseErrors++;
            console.warn('Failed to parse JSON-LD schema:', e.message);
            schemaData.push({
                error: 'Failed to parse',
                content: $(element).html()?.substring(0, 200) + '...' // Store snippet on error
            });
        }
    });
    // Also check for Microdata (basic check for presence)
    const hasMicrodata = $('[itemscope]').length > 0;
    if (hasMicrodata && !hasSchema) hasSchema = true; // Indicate schema presence if microdata found

    return {
        hasSchema: hasSchema || hasMicrodata,
        jsonLdCount: schemaData.length,
        jsonLdParseErrors: parseErrors,
        hasMicrodata: hasMicrodata,
        data: schemaData // Contains parsed JSON or error snippets
    };
};

// --- Main Analysis Orchestrator ---

/**
 * Performs SEO analysis on a given URL.
 * @param {string} url - The URL to analyze.
 * @returns {Promise<object>} - The analysis report object (or an error object).
 */
export const performSeoAnalysis = async (url) => {
    const startTime = Date.now();
    let initialUrl = url;
    let siteUrlForChecks; // URL object for base checks like robots/sitemap

    // Basic URL validation and normalization
    try {
        if (!initialUrl.startsWith('http://') && !initialUrl.startsWith('https://')) {
            initialUrl = 'http://' + initialUrl; // Default to http
        }
        new URL(initialUrl); // Validate if it parses
    } catch {
        return {
            url: url, // Return original user input
            error: 'Invalid URL format provided.',
            status: 400,
            analysisTimeMs: Date.now() - startTime
        };
    }

    const { html, $, finalUrl, status, error: fetchError } = await fetchAndParseUrl(initialUrl);

    if (fetchError) {
        return {
            url: url, // Return original user input
            finalUrl: finalUrl || null,
            error: fetchError,
            status: status || 500,
            analysisTimeMs: Date.now() - startTime
        };
    }

    try {
        // Use the final URL's origin for site-wide checks
        siteUrlForChecks = new URL(finalUrl);

        // Run checks in parallel where possible
        const [
            robotsAnalysis,
            sitemapAnalysisResult,
            httpsAnalysis,
            metaTagsAnalysis,
            headingsAnalysis,
            imagesAnalysis,
            contentAnalysis,
            mobileAnalysis,
            schemaAnalysis
        ] = await Promise.all([
            checkRobotsTxt(siteUrlForChecks),
            Promise.resolve().then(async () => {
                // Sitemap depends on robots, run sequentially within Promise.all slot
                const robotsResult = await checkRobotsTxt(siteUrlForChecks); // Re-check or pass previous result
                return checkSitemap(siteUrlForChecks, robotsResult);
            }),
            Promise.resolve(checkHttps(finalUrl)),
            Promise.resolve(analyzeMetaTags($)),
            Promise.resolve(analyzeHeadings($)),
            Promise.resolve(analyzeImages($)),
            Promise.resolve(analyzeContent($, html)), // Pass html for ratio calc
            Promise.resolve(checkMobileFriendliness($)),
            Promise.resolve(checkSchemaMarkup($))
            // Add promises for future checks here (e.g., performance API call)
        ]);

        // Placeholder for Performance Analysis (e.g., Core Web Vitals via PageSpeed Insights API)
        const performanceAnalysis = { status: 'pending_integration', score: null };

        // Placeholder for AI-powered suggestions
        const aiSuggestions = { status: 'pending_integration', summary: null };

        // TODO: Calculate an overall score based on checks
        const overallScore = null; // Placeholder

        const analysisTimeMs = Date.now() - startTime;

        // Construct the report object structure expected by the Report model
        const report = {
            url: url, // Original requested URL
            finalUrl: finalUrl,
            status: status, // HTTP status of final URL
            analysisTimeMs: analysisTimeMs,
            overallScore: overallScore, // Placeholder
            checks: {
                https: httpsAnalysis,
                robotsTxt: robotsAnalysis,
                sitemap: sitemapAnalysisResult, // Use the result from the sequential check
                metaTags: metaTagsAnalysis,
                headings: headingsAnalysis,
                images: imagesAnalysis,
                content: contentAnalysis,
                mobileFriendly: mobileAnalysis,
                schemaMarkup: schemaAnalysis,
                performance: performanceAnalysis
                // Add other checks like links, hreflang etc.
            },
            aiSuggestions: aiSuggestions
            // createdAt will be added by Mongoose
            // userId will be added before saving
        };

        return report;
    } catch (analysisError) {
        console.error(`Analysis error for ${url} (final: ${finalUrl}):`, analysisError);
        return {
            url: url,
            finalUrl: finalUrl,
            status: status, // Original fetch status
            error: `Analysis failed after fetching content: ${analysisError.message}`,
            analysisTimeMs: Date.now() - startTime
        };
    }
};

// --- Router ---

// POST /api/search/analyze
router.post('/analyze', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const userId = req.user.id; // Get user ID from authenticated token

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Basic URL validation on the server too
    let validatedUrl;
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            validatedUrl = 'http://' + url;
        } else {
            validatedUrl = url;
        }
        new URL(validatedUrl); // Check if it parses
    } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    // --- Placeholder for Usage Limit Check ---
    // TODO: Implement checkUsageLimit middleware or logic here
    // try {
    //     const user = await User.findById(userId).select('+analysisUsage'); // Ensure field is selected if needed
    //     if (!user) return res.status(401).json({ error: 'User not found' });
    //
    //     const limit = user.isPremium ? 1000 : 10; // Example limits
    //     const period = 24 * 60 * 60 * 1000; // 24 hours
    //     const now = Date.now();
    //     const usageWindowStart = now - period;
    //
    //     user.analysisUsage = user.analysisUsage.filter(ts => ts > usageWindowStart);
    //
    //     if (user.analysisUsage.length >= limit) {
    //         const nextAvailable = new Date(user.analysisUsage[0] + period);
    //         return res.status(429).json({ error: `Usage limit (${limit}/day) reached. Try again after ${nextAvailable.toLocaleString()}` });
    //     }
    //
    //     // Record usage *before* starting analysis (or after successful save)
    //     user.analysisUsage.push(now);
    //     await user.save();
    //
    // } catch (limitError) {
    //     console.error('Error checking usage limit:', limitError);
    //     return res.status(500).json({ error: 'Failed to verify usage limits.' });
    // }
    // --- End Usage Limit Placeholder ---

    // Optional: Implement job queue for long-running analysis
    // For now, run synchronously
    try {
        const analysisResult = await performSeoAnalysis(url); // Use original URL for analysis fn

        // Check for critical errors returned by performSeoAnalysis
        if (analysisResult.error && !analysisResult.checks) {
            // If fetching or initial validation failed badly
            return res
                .status(analysisResult.status || 500)
                .json({ error: analysisResult.error, url: analysisResult.url });
        }

        // Analysis completed (even if some checks inside failed, but fetch was ok)
        // Save the report to the database
        try {
            const reportToSave = new Report({
                ...analysisResult,
                userId: userId,
                status: analysisResult.error ? 'completed_with_errors' : 'completed' // Set status based on analysis outcome
            });
            const savedReport = await reportToSave.save();

            // Return the saved report (includes _id, createdAt, etc.)
            res.status(200).json(savedReport);
        } catch (dbError) {
            console.error('Error saving report to database:', dbError);
            // Decide if we should still return the analysis result even if saving failed
            // Option 1: Return error
            res.status(500).json({
                error: 'Analysis completed but failed to save the report.',
                analysisResult: process.env.NODE_ENV !== 'production' ? analysisResult : undefined // Optionally include result in non-prod
            });
            // Option 2: Return analysis result anyway (client might not get history)
            // res.status(200).json({ ...analysisResult, warning: 'Failed to save report history.' });
        }
    } catch (error) {
        // Catch unexpected errors during the analysis orchestration or saving process
        console.error('Unhandled analysis endpoint error:', error);
        res.status(500).json({ error: 'An unexpected error occurred during analysis.' });
    }
});

export default router;
