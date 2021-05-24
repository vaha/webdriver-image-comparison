// @ts-ignore
import {yellow} from 'chalk';
import scrollToPosition from '../clientSideScripts/scrollToPosition';
import getDocumentScrollHeight from '../clientSideScripts/getDocumentScrollHeight';
import getAndroidStatusAddressToolBarHeight from '../clientSideScripts/getAndroidStatusAddressToolBarHeight';
import getIosStatusAddressToolBarHeight from '../clientSideScripts/getIosStatusAddressToolBarHeight';
import {OFFSETS} from '../helpers/constants';
import {calculateDprData, getScreenshotSize, waitFor} from '../helpers/utils';
import {Executor, TakeScreenShot} from './methods.interface';
import {
  FullPageScreenshotOptions,
  FullPageScreenshotNativeMobileOptions,
  FullPageScreenshotDataOptions,
  FullPageScreenshotsData,
} from './screenshots.interfaces';
import {StatusAddressToolBarHeight} from '../clientSideScripts/statusAddressToolBarHeight.interfaces';
import hideRemoveElements from '../clientSideScripts/hideRemoveElements';
import hideScrollBars from '../clientSideScripts/hideScrollbars';
import {LogLevel} from "../helpers/options.interface";
import {error} from "selenium-webdriver";

/**
 * Take a full page screenshots for desktop / iOS / Android
 */
export async function getBase64FullPageScreenshotsData(
  takeScreenshot: TakeScreenShot,
  executor: Executor,
  options: FullPageScreenshotDataOptions,
): Promise<FullPageScreenshotsData> {
  const {
    addressBarShadowPadding,
    devicePixelRatio,
    fullPageScrollTimeout,
    hideAfterFirstScroll,
    innerHeight,
    isAndroid,
    isAndroidNativeWebScreenshot,
    isAndroidChromeDriverScreenshot,
    isHybridApp,
    isIos,
    logLevel,
    toolBarShadowPadding,
  } = options;
  const desktopOptions = {
    devicePixelRatio,
    fullPageScrollTimeout,
    hideAfterFirstScroll,
    innerHeight,
    logLevel,
  };
  const nativeMobileOptions = {
    ...desktopOptions,
    addressBarShadowPadding,
    toolBarShadowPadding,
  };

  if (isAndroid && isAndroidNativeWebScreenshot) {
    // Create a fullpage screenshot for Android when native screenshot (so including status, address and toolbar) is created
    const statusAddressBarHeight = (
      <StatusAddressToolBarHeight>(await executor(getAndroidStatusAddressToolBarHeight, OFFSETS.ANDROID, isHybridApp))
    ).statusAddressBar.height;
    const androidNativeMobileOptions = {...nativeMobileOptions, statusAddressBarHeight};

    return getFullPageScreenshotsDataNativeMobile(takeScreenshot, executor, androidNativeMobileOptions);
  } else if (isAndroid && isAndroidChromeDriverScreenshot) {
    const chromeDriverOptions = {devicePixelRatio, fullPageScrollTimeout, hideAfterFirstScroll, innerHeight, logLevel};

    // Create a fullpage screenshot for Android when the ChromeDriver provides the screenshots
    return getFullPageScreenshotsDataAndroidChromeDriver(takeScreenshot, executor, chromeDriverOptions);
  } else if (isIos) {
    // Create a fullpage screenshot for iOS. iOS screenshots will hold the status, address and toolbar so they need to be removed
    const statusAddressBarHeight = (
      <StatusAddressToolBarHeight>(await executor(getIosStatusAddressToolBarHeight, OFFSETS.IOS))
    ).statusAddressBar.height;
    const iosNativeMobileOptions = {...nativeMobileOptions, statusAddressBarHeight};

    return getFullPageScreenshotsDataNativeMobile(takeScreenshot, executor, iosNativeMobileOptions);
  }

  // Create a fullpage screenshot for all desktops
  return getFullPageScreenshotsDataDesktop(takeScreenshot, executor, desktopOptions);
}

/**
 * Take a full page screenshots for native mobile
 */
export async function getFullPageScreenshotsDataNativeMobile(
  takeScreenshot: TakeScreenShot,
  executor: Executor,
  options: FullPageScreenshotNativeMobileOptions,
): Promise<FullPageScreenshotsData> {
  const viewportScreenshots = [];

  // The addressBarShadowPadding and toolBarShadowPadding is used because the viewport has a shadow on the address and the tool bar
  // so the cutout of the vieport needs to be a little bit smaller
  const {
    addressBarShadowPadding,
    devicePixelRatio,
    fullPageScrollTimeout,
    hideAfterFirstScroll,
    innerHeight,
    logLevel,
    statusAddressBarHeight,
    toolBarShadowPadding,
  } = options;
  const iosViewportHeight = innerHeight - addressBarShadowPadding - toolBarShadowPadding;

  // Start with an empty array, during the scroll it will be filled because a page could also have a lazy loading
  const amountOfScrollsArray = [];
  let scrollHeight: number;
  let screenshotSizeWidth: number;

  for (let i = 0; i <= amountOfScrollsArray.length; i++) {
    // Determine and start scrolling
    const scrollY = iosViewportHeight * i;
    await executor(scrollToPosition, scrollY, options.scrollableElement);

    // Hide scrollbars before taking a screenshot, we don't want them, on the screenshot
    await executor(hideScrollBars, true);

    // Simply wait the amount of time specified for lazy-loading
    await waitFor(fullPageScrollTimeout);

    // Elements that need to be hidden after the first scroll for a fullpage scroll
    if (i === 1 && hideAfterFirstScroll.length > 0) {
      try {
        await executor(hideRemoveElements, {hide: hideAfterFirstScroll, remove: []}, true);
      } catch (e) {
        logHiddenRemovedError(e, logLevel);
      }
    }

    // Take the screenshot and get the width
    const screenshot = await takeBase64Screenshot(takeScreenshot);
    screenshotSizeWidth = getScreenshotSize(screenshot, devicePixelRatio).width;

    // Determine scroll height and check if we need to scroll again
    scrollHeight = await executor(getDocumentScrollHeight);
    if (((scrollY + iosViewportHeight) < scrollHeight)) {
      amountOfScrollsArray.push(amountOfScrollsArray.length);
    }
    // There is no else

    // The height of the image of the last 1 could be different
    const imageHeight = amountOfScrollsArray.length === i ? scrollHeight - scrollY : iosViewportHeight;

    // The starting position for cropping could be different for the last image
    // The cropping always needs to start at status and address bar height and the address bar shadow padding
    const imageYPosition = (amountOfScrollsArray.length === i ? innerHeight - imageHeight : 0) + statusAddressBarHeight + addressBarShadowPadding;

    // Store all the screenshot data in the screenshot object
    viewportScreenshots.push({
      ...calculateDprData({
        canvasWidth: screenshotSizeWidth,
        canvasYPosition: scrollY,
        imageHeight: imageHeight,
        imageWidth: screenshotSizeWidth,
        imageYPosition: imageYPosition,
      }, devicePixelRatio),
      screenshot,
    });

    // Show scrollbars again
    await executor(hideScrollBars, false);
  }

  // Put back the hidden elements to visible
  if (hideAfterFirstScroll.length > 0) {
    try {
      await executor(hideRemoveElements, {hide: hideAfterFirstScroll, remove: []}, false);
    } catch (e) {
      logHiddenRemovedError(e, logLevel);
    }
  }

  return {
    ...calculateDprData({
      fullPageHeight: scrollHeight - addressBarShadowPadding - toolBarShadowPadding,
      fullPageWidth: screenshotSizeWidth,
    }, devicePixelRatio),
    data: viewportScreenshots,
  };
}

/**
 * Take a full page screenshot for Android with Chromedriver
 */
export async function getFullPageScreenshotsDataAndroidChromeDriver(
  takeScreenshot: TakeScreenShot,
  executor: Executor,
  options: FullPageScreenshotOptions,
): Promise<FullPageScreenshotsData> {
  const viewportScreenshots = [];
  const {devicePixelRatio, fullPageScrollTimeout, hideAfterFirstScroll, innerHeight, logLevel} = options;

  // Start with an empty array, during the scroll it will be filled because a page could also have a lazy loading
  const amountOfScrollsArray = [];
  let scrollHeight: number;
  let screenshotSize;

  for (let i = 0; i <= amountOfScrollsArray.length; i++) {
    // Determine and start scrolling
    const scrollY = innerHeight * i;
    await executor(scrollToPosition, scrollY, options.scrollableElement);

    // Hide scrollbars before taking a screenshot, we don't want them, on the screenshot
    await executor(hideScrollBars, true);

    // Simply wait the amount of time specified for lazy-loading
    await waitFor(fullPageScrollTimeout);

    // Elements that need to be hidden after the first scroll for a fullpage scroll
    if (i === 1 && hideAfterFirstScroll.length > 0) {
      try {
        await executor(hideRemoveElements, {hide: hideAfterFirstScroll, remove: []}, true);
      } catch (e) {
        logHiddenRemovedError(e, logLevel);
      }
    }

    // Take the screenshot
    const screenshot = await takeBase64Screenshot(takeScreenshot);
    screenshotSize = getScreenshotSize(screenshot, devicePixelRatio);

    // Determine scroll height and check if we need to scroll again
    scrollHeight = await executor(getDocumentScrollHeight);
    if ((scrollY + innerHeight) < scrollHeight) {
      amountOfScrollsArray.push(amountOfScrollsArray.length);
    }
    // There is no else

    // The height of the image of the last 1 could be different
    const imageHeight: number = amountOfScrollsArray.length === i ? scrollHeight - (innerHeight * viewportScreenshots.length) : innerHeight;
    // The starting position for cropping could be different for the last image (0 means no cropping)
    const imageYPosition = (amountOfScrollsArray.length === i && amountOfScrollsArray.length !== 0) ? innerHeight - imageHeight : 0;

    // Store all the screenshot data in the screenshot object
    viewportScreenshots.push({
      ...calculateDprData({
        canvasWidth: screenshotSize.width,
        canvasYPosition: scrollY,
        imageHeight: imageHeight,
        imageWidth: screenshotSize.width,
        imageYPosition: imageYPosition,
      }, devicePixelRatio),
      screenshot,
    });

    // Show the scrollbars again
    await executor(hideScrollBars, false);
  }

  // Put back the hidden elements to visible
  if (hideAfterFirstScroll.length > 0) {
    try {
      await executor(hideRemoveElements, {hide: hideAfterFirstScroll, remove: []}, false);
    } catch (e) {
      logHiddenRemovedError(e, logLevel);
    }
  }

  return {
    ...calculateDprData({
      fullPageHeight: scrollHeight,
      fullPageWidth: screenshotSize.width,
    }, devicePixelRatio),
    data: viewportScreenshots,
  };
}

/**
 * Take a full page screenshots
 */
export async function getFullPageScreenshotsDataDesktop(
  takeScreenshot: TakeScreenShot,
  executor: Executor,
  options: FullPageScreenshotOptions,
): Promise<FullPageScreenshotsData> {
  const viewportScreenshots = [];
  const {devicePixelRatio, fullPageScrollTimeout, hideAfterFirstScroll, innerHeight, logLevel} = options;
  let actualInnerHeight = innerHeight;

  // Start with an empty array, during the scroll it will be filled because a page could also have a lazy loading
  const amountOfScrollsArray = [];
  let scrollHeight: number;
  let screenshotSize;

  for (let i = 0; i <= amountOfScrollsArray.length; i++) {
    // Determine and start scrolling
    const scrollY = actualInnerHeight * i;
    await executor(scrollToPosition, scrollY, options.scrollableElement);

    // Simply wait the amount of time specified for lazy-loading
    await waitFor(fullPageScrollTimeout);

    // Elements that need to be hidden after the first scroll for a fullpage scroll
    if (i === 1 && hideAfterFirstScroll.length > 0) {
      try {
        await executor(hideRemoveElements, {hide: hideAfterFirstScroll, remove: []}, true);
      } catch (e) {
        logHiddenRemovedError(e, logLevel);
      }
    }

    // Take the screenshot
    const screenshot = await takeBase64Screenshot(takeScreenshot);
    screenshotSize = getScreenshotSize(screenshot, devicePixelRatio);

    // The actual screenshot size might be slightly different than the inner height
    // In that case, use the screenshot size instead of the innerHeight
    if (i === 0 && screenshotSize.height !== actualInnerHeight) {
      if (Math.round(screenshotSize.height) === actualInnerHeight) {
        actualInnerHeight = screenshotSize.height;
      }
      // No else, because some drivers take a full page screenshot, e.g. some versions of FireFox,
      // and SafariDriver for Safari 11
    }

    // Determine scroll height and check if we need to scroll again
    scrollHeight = await executor(getDocumentScrollHeight);

    if (((scrollY + actualInnerHeight) < scrollHeight && screenshotSize.height === actualInnerHeight)) {
      amountOfScrollsArray.push(amountOfScrollsArray.length);
    }
    // There is no else, Lazy load and large screenshots,
    // like with older drivers such as FF <= 47 and IE11, will not work

    // The height of the image of the last 1 could be different
    const imageHeight: number = amountOfScrollsArray.length === i
      ? scrollHeight - (actualInnerHeight * viewportScreenshots.length)
      : screenshotSize.height;
    // The starting position for cropping could be different for the last image (0 means no cropping)
    const imageYPosition = (amountOfScrollsArray.length === i && amountOfScrollsArray.length !== 0) ? actualInnerHeight - imageHeight : 0;

    // Store all the screenshot data in the screenshot object
    viewportScreenshots.push({
      ...calculateDprData({
        canvasWidth: screenshotSize.width,
        canvasYPosition: scrollY,
        imageHeight: imageHeight,
        imageWidth: screenshotSize.width,
        imageYPosition: imageYPosition,
      }, devicePixelRatio),
      screenshot,
    });
  }

  // Put back the hidden elements to visible
  if (hideAfterFirstScroll.length > 0) {
    try {
      await executor(hideRemoveElements, {hide: hideAfterFirstScroll, remove: []}, false);
    } catch (e) {
      logHiddenRemovedError(e, logLevel);
    }
  }

  return {
    ...calculateDprData({
      fullPageHeight: scrollHeight,
      fullPageWidth: screenshotSize.width,
    }, devicePixelRatio),
    data: viewportScreenshots,
  };
}

/**
 * Take a screenshot
 */
export async function takeBase64Screenshot(takeScreenshot: TakeScreenShot): Promise<string> {
  return takeScreenshot();
}

/**
 * Log an error for not being able to hide remove elements
 *
 * @TODO: remove the any
 */
function logHiddenRemovedError(error:any, logLevel:LogLevel){
  if(logLevel === LogLevel.debug || logLevel === LogLevel.warn) {
    console.log(yellow(`
#####################################################################################
 WARNING:
 (One of) the elements that needed to be hidden or removed could not be found on the
 page and caused this error
 Error: ${error}
 We made sure the test didn't break.
#####################################################################################
`));
  }
}
