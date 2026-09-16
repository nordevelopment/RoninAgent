import { describe, it, expect, afterAll } from 'vitest';
import { WebPageContent } from '../backend/services/WebPageContent.js';
import { browserService } from '../backend/services/BrowserService.js';
import * as cheerio from 'cheerio';

describe('List.am Live Scraping & Parsing', () => {
  afterAll(async () => {
    await browserService.close();
  });

  it('fetches list.am search results without being blocked by Cloudflare', async () => {
    const url = 'https://www.list.am/category?q=iphone+15&price1=80000&price2=140000&crc=0';
    const html = await browserService.fetchDynamicPage(url);

    expect(html).toBeTruthy();
    expect(html.toLowerCase()).not.toContain('just a moment');
    expect(html).toContain('/item/');

    const $ = cheerio.load(html);
    const itemLinks = $('a[href^="/item/"]');
    console.log(`[Live Test] Found ${itemLinks.length} listing links on List.am`);
    expect(itemLinks.length).toBeGreaterThan(5);
  }, 40000);

  it('WebPageContent converts list.am page to markdown including all listings', async () => {
    const url = 'https://www.list.am/category?q=iphone+15&price1=80000&price2=140000&crc=0';
    const webPage = new WebPageContent();
    const markdown = await webPage.fetchPage({ url });

    console.log('[Live Test] Markdown length:', markdown.length);
    expect(markdown).toBeTruthy();
    expect(markdown).not.toContain('Error fetching URL');

    const itemLinks = markdown.match(/https:\/\/www\.list\.am\/item\/\d+/g) || [];
    console.log(`[Live Test] Extracted ${itemLinks.length} distinct item links in markdown`);
    expect(itemLinks.length).toBeGreaterThan(10);

    // Verify key products found on the page
    const hasPink = markdown.includes('վարդագույն');
    const hasBlue = markdown.includes('կապույտ');
    const hasBlackPro = markdown.includes('15 Pro') && markdown.includes('սև');

    console.log(`[Live Test] Pink (վարդագույն): ${hasPink}, Blue (կապույտ): ${hasBlue}, Black 15 Pro (սև): ${hasBlackPro}`);
    expect(hasPink).toBe(true);
    expect(hasBlue).toBe(true);
    expect(hasBlackPro).toBe(true);

    // Verify clean URL formatting (ld_src stripped)
    expect(markdown).toContain('https://www.list.am/item/22055944');
    expect(markdown).not.toContain('ld_src=');
  }, 40000);

  it('works universally for different products and currencies (e.g. PlayStation 5 in USD)', async () => {
    const url = 'https://www.list.am/category?q=playstation+5&price1=300&price2=700&crc=1';
    const webPage = new WebPageContent();
    const markdown = await webPage.fetchPage({ url });

    expect(markdown).toBeTruthy();
    expect(markdown).not.toContain('Error fetching URL');

    const itemLinks = markdown.match(/https:\/\/www\.list\.am\/item\/\d+/g) || [];
    console.log(`[Live Test - PS5 USD] Extracted ${itemLinks.length} distinct item links`);
    expect(itemLinks.length).toBeGreaterThan(5);

    // Verify it actually fetched PlayStation listings
    const hasPlayStation = markdown.toLowerCase().includes('playstation') || markdown.toLowerCase().includes('ps5');
    expect(hasPlayStation).toBe(true);
    expect(markdown).not.toContain('ld_src=');
  }, 40000);
});
