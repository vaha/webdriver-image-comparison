import {ensureDirSync, pathExistsSync} from 'fs-extra';
import {join, normalize} from 'path';
import BaseClass from './base';

describe('BaseClass', () => {
  it('should be able to create BaseClass with options', () => {
    const instance = new BaseClass({
      baselineFolder: './subfolder//../baseline',
      screenshotPath: './../my_folder//screenshots'
    });
    expect(instance.folders.actualFolder).toBe(normalize('../my_folder/screenshots/actual'));
    expect(instance.folders.baselineFolder).toBe('baseline');
    expect(instance.folders.diffFolder).toBe(normalize('../my_folder/screenshots/diff'));
  });

  it('should be able to create baselineFolder with a function', () => {
    const options = {
      baseline: './subfolder//../baseline',
      screenshot: './../my_folder//screenshots'
    };
    const setPath = (folderPath: any) => {
      return folderPath;
    };
    const instance = new BaseClass({
      baselineFolder: setPath(options.baseline),
      screenshotPath: setPath(options.screenshot)
    });
    expect(instance.folders.actualFolder).toBe(normalize('../my_folder/screenshots/actual'));
    expect(instance.folders.baselineFolder).toBe('baseline');
    expect(instance.folders.diffFolder).toBe(normalize('../my_folder/screenshots/diff'));
  });  

  it('should be able to create BaseClass with default options', () => {
    const instance = new BaseClass({});
    expect(instance.folders.actualFolder).toBe(normalize('.tmp/actual'));
    expect(instance.folders.baselineFolder).toBe(normalize('wic/baseline/'));
    expect(instance.folders.diffFolder).toBe(normalize('.tmp/diff'));
  });

  it('should remove the actual and diff folder if this is needed', () => {
    // Create the folders
    const actual = join(process.cwd(), '/.tmp/actual');
    const diff = join(process.cwd(), '/.tmp/diff');
    ensureDirSync(actual);
    ensureDirSync(diff);

    expect(pathExistsSync(actual)).toEqual(true);
    expect(pathExistsSync(diff)).toEqual(true);

    const instance = new BaseClass({clearRuntimeFolder: true});

    expect(pathExistsSync(actual)).toEqual(false);
    expect(pathExistsSync(diff)).toEqual(false);
  });
});
