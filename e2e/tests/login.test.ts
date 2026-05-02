import { Builder, By, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT = 15000;

function getChromeOptions(): chrome.Options {
  const options = new chrome.Options();
  if (process.env.HEADLESS === 'true') {
    options.addArguments('--headless=new');
  }
  options.addArguments('--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu');
  return options;
}

describe('Login Page E2E', () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(getChromeOptions())
      .build();
    await driver.manage().setTimeouts({ implicit: 5000 });
  });

  afterAll(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  it('loads the login page', async () => {
    await driver.get(`${BASE_URL}/login`);
    // Wait for the page to fully hydrate by checking for the submit button
    await driver.wait(
      until.elementLocated(By.css('button[type="submit"]')),
      TIMEOUT
    );
    const pageSource = await driver.getPageSource();
    expect(pageSource).toContain('Persuaider');
  });

  it('shows email and password fields', async () => {
    await driver.get(`${BASE_URL}/login`);
    const emailInput = await driver.wait(
      until.elementLocated(By.css('input[name="email"]')),
      TIMEOUT
    );
    const passwordInput = await driver.findElement(By.css('input[name="password"]'));
    expect(await emailInput.isDisplayed()).toBe(true);
    expect(await passwordInput.isDisplayed()).toBe(true);
  });

  it('has email input of correct type', async () => {
    await driver.get(`${BASE_URL}/login`);
    const emailInput = await driver.wait(
      until.elementLocated(By.css('input[name="email"]')),
      TIMEOUT
    );
    expect(await emailInput.getAttribute('type')).toBe('email');
  });

  it('has password input of correct type', async () => {
    await driver.get(`${BASE_URL}/login`);
    const passwordInput = await driver.wait(
      until.elementLocated(By.css('input[name="password"]')),
      TIMEOUT
    );
    expect(await passwordInput.getAttribute('type')).toBe('password');
  });

  it('shows sign in button', async () => {
    await driver.get(`${BASE_URL}/login`);
    const submitButton = await driver.wait(
      until.elementLocated(By.css('button[type="submit"]')),
      TIMEOUT
    );
    expect(await submitButton.getText()).toContain('Sign in');
  });

  it('shows error on invalid credentials', async () => {
    await driver.get(`${BASE_URL}/login`);

    const emailInput = await driver.wait(
      until.elementLocated(By.css('input[name="email"]')),
      TIMEOUT
    );
    const passwordInput = await driver.findElement(By.css('input[name="password"]'));
    const submitButton = await driver.findElement(By.css('button[type="submit"]'));

    await emailInput.clear();
    await emailInput.sendKeys('nonexistent@example.com');
    await passwordInput.clear();
    await passwordInput.sendKeys('wrongpassword');
    await submitButton.click();

    // Wait for error message to appear
    const errorMessage = await driver.wait(
      until.elementLocated(By.xpath("//*[contains(text(),'Invalid email or password')]")),
      TIMEOUT
    );
    expect(await errorMessage.isDisplayed()).toBe(true);
  });

  it('redirects to dashboard on successful login', async () => {
    await driver.get(`${BASE_URL}/login`);

    const emailInput = await driver.wait(
      until.elementLocated(By.css('input[name="email"]')),
      TIMEOUT
    );
    const passwordInput = await driver.findElement(By.css('input[name="password"]'));
    const submitButton = await driver.findElement(By.css('button[type="submit"]'));

    // Use seeded demo user credentials
    await emailInput.clear();
    await emailInput.sendKeys('demo@persuaider.com');
    await passwordInput.clear();
    await passwordInput.sendKeys('demo123');
    await submitButton.click();

    // Wait for redirect to dashboard
    await driver.wait(until.urlContains('/dashboard'), TIMEOUT);
    const currentUrl = await driver.getCurrentUrl();
    expect(currentUrl).toContain('/dashboard');
  });
});

describe('Home Page E2E', () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(getChromeOptions())
      .build();
    await driver.manage().setTimeouts({ implicit: 5000 });
  });

  afterAll(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  it('loads the home page', async () => {
    await driver.get(BASE_URL);
    const body = await driver.wait(until.elementLocated(By.css('body')), TIMEOUT);
    expect(await body.isDisplayed()).toBe(true);
  });

  it('shows application title or branding', async () => {
    await driver.get(BASE_URL);
    const pageSource = await driver.getPageSource();
    expect(pageSource.toLowerCase()).toContain('persuaider');
  });
});
