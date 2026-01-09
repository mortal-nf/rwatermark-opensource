
import puppeteer from 'puppeteer-core';
import chromeFinder from 'chrome-finder'
let browserWSEndpoint;
let chromeFinderPath=process.env.CHROME_PATH||chromeFinder();
async function getBrowserInstance(getNew,  executablePath?) {
  if (browserWSEndpoint && !getNew) {
    return browserWSEndpoint
  }
  const browser = await puppeteer.launch({
    executablePath: executablePath ? executablePath : chromeFinderPath,
    headless: true,
   
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // 防止 /dev/shm 空间不足
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
    ], //
   
   
  });

  browserWSEndpoint = browser.wsEndpoint();
  return browserWSEndpoint;
}

async function getBrowser(getNew?: boolean,  executablePath?) {
  const browserWSEndpoint = await getBrowserInstance(getNew, executablePath);
  const browser = await puppeteer.connect({
    browserWSEndpoint,
    protocolTimeout: 0,
  })
  return browser
}

async function connectBrowser(browserWS) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: browserWS,
    protocolTimeout: 0,
    // defaultViewport: null,
    defaultViewport: null
  })
  return browser
}
export const getEndpoint = getBrowserInstance
export { getBrowser, connectBrowser }