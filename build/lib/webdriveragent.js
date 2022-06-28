"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.WebDriverAgent = void 0;

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _path = _interopRequireDefault(require("path"));

var _url2 = _interopRequireDefault(require("url"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _appiumBaseDriver = require("appium-base-driver");

var _appiumSupport = require("appium-support");

var _logger = _interopRequireDefault(require("./logger"));

var _noSessionProxy = require("./no-session-proxy");

var _utils = require("./utils");

var _xcodebuild = _interopRequireDefault(require("./xcodebuild"));

var _asyncLock = _interopRequireDefault(require("async-lock"));

var _teen_process = require("teen_process");

var _checkDependencies = require("./check-dependencies");

var _constants = require("./constants");

const WDA_LAUNCH_TIMEOUT = 60 * 1000;
const WDA_AGENT_PORT = 8100;
const WDA_CF_BUNDLE_NAME = 'WebDriverAgentRunner-Runner';
const SHARED_RESOURCES_GUARD = new _asyncLock.default();

class WebDriverAgent {
  constructor(xcodeVersion, args = {}) {
    this.xcodeVersion = xcodeVersion;
    this.args = _lodash.default.clone(args);
    this.device = args.device;
    this.platformVersion = args.platformVersion;
    this.platformName = args.platformName;
    this.iosSdkVersion = args.iosSdkVersion;
    this.host = args.host;
    this.isRealDevice = !!args.realDevice;
    this.idb = (args.device || {}).idb;
    this.wdaBundlePath = args.wdaBundlePath;
    this.setWDAPaths(args.bootstrapPath, args.agentPath);
    this.wdaLocalPort = args.wdaLocalPort;
    this.wdaRemotePort = args.wdaLocalPort || WDA_AGENT_PORT;
    this.wdaBaseUrl = args.wdaBaseUrl || _constants.WDA_BASE_URL;
    this.prebuildWDA = args.prebuildWDA;
    this.webDriverAgentUrl = args.webDriverAgentUrl;
    this.started = false;
    this.wdaConnectionTimeout = args.wdaConnectionTimeout;
    this.useXctestrunFile = args.useXctestrunFile;
    this.usePrebuiltWDA = args.usePrebuiltWDA;
    this.derivedDataPath = args.derivedDataPath;
    this.mjpegServerPort = args.mjpegServerPort;
    this.updatedWDABundleId = args.updatedWDABundleId;
    this.xcodebuild = new _xcodebuild.default(this.xcodeVersion, this.device, {
      platformVersion: this.platformVersion,
      platformName: this.platformName,
      iosSdkVersion: this.iosSdkVersion,
      agentPath: this.agentPath,
      bootstrapPath: this.bootstrapPath,
      realDevice: this.isRealDevice,
      showXcodeLog: args.showXcodeLog,
      xcodeConfigFile: args.xcodeConfigFile,
      xcodeOrgId: args.xcodeOrgId,
      xcodeSigningId: args.xcodeSigningId,
      keychainPath: args.keychainPath,
      keychainPassword: args.keychainPassword,
      useSimpleBuildTest: args.useSimpleBuildTest,
      usePrebuiltWDA: args.usePrebuiltWDA,
      updatedWDABundleId: this.updatedWDABundleId,
      launchTimeout: args.wdaLaunchTimeout || WDA_LAUNCH_TIMEOUT,
      wdaRemotePort: this.wdaRemotePort,
      useXctestrunFile: this.useXctestrunFile,
      derivedDataPath: args.derivedDataPath,
      mjpegServerPort: this.mjpegServerPort,
      allowProvisioningDeviceRegistration: args.allowProvisioningDeviceRegistration,
      resultBundlePath: args.resultBundlePath,
      resultBundleVersion: args.resultBundleVersion
    });
  }

  setWDAPaths(bootstrapPath, agentPath) {
    this.bootstrapPath = bootstrapPath || _constants.BOOTSTRAP_PATH;

    _logger.default.info(`Using WDA path: '${this.bootstrapPath}'`);

    this.agentPath = agentPath || _path.default.resolve(this.bootstrapPath, 'WebDriverAgent.xcodeproj');

    _logger.default.info(`Using WDA agent: '${this.agentPath}'`);
  }

  async cleanupObsoleteProcesses() {
    const obsoletePids = await (0, _utils.getPIDsListeningOnPort)(this.url.port, cmdLine => cmdLine.includes('/WebDriverAgentRunner') && !cmdLine.toLowerCase().includes(this.device.udid.toLowerCase()));

    if (_lodash.default.isEmpty(obsoletePids)) {
      _logger.default.debug(`No obsolete cached processes from previous WDA sessions ` + `listening on port ${this.url.port} have been found`);

      return;
    }

    _logger.default.info(`Detected ${obsoletePids.length} obsolete cached process${obsoletePids.length === 1 ? '' : 'es'} ` + `from previous WDA sessions. Cleaning them up`);

    try {
      await (0, _teen_process.exec)('kill', obsoletePids);
    } catch (e) {
      _logger.default.warn(`Failed to kill obsolete cached process${obsoletePids.length === 1 ? '' : 'es'} '${obsoletePids}'. ` + `Original error: ${e.message}`);
    }
  }

  async isRunning() {
    return !!(await this.getStatus());
  }

  get basePath() {
    if (this.url.path === '/') {
      return '';
    }

    return this.url.path || '';
  }

  async getStatus() {
    const noSessionProxy = new _noSessionProxy.NoSessionProxy({
      server: this.url.hostname,
      port: this.url.port,
      base: this.basePath,
      timeout: 3000
    });

    try {
      return await noSessionProxy.command('/status', 'GET');
    } catch (err) {
      _logger.default.debug(`WDA is not listening at '${this.url.href}'`);

      return null;
    }
  }

  async uninstall() {
    try {
      const bundleIds = await this.device.getUserInstalledBundleIdsByBundleName(WDA_CF_BUNDLE_NAME);

      if (_lodash.default.isEmpty(bundleIds)) {
        _logger.default.debug('No WDAs on the device.');

        return;
      }

      _logger.default.debug(`Uninstalling WDAs: '${bundleIds}'`);

      for (const bundleId of bundleIds) {
        await this.device.removeApp(bundleId);
      }
    } catch (e) {
      _logger.default.debug(e);

      _logger.default.warn(`WebDriverAgent uninstall failed. Perhaps, it is already uninstalled? ` + `Original error: ${e.message}`);
    }
  }

  async _cleanupProjectIfFresh() {
    const homeFolder = process.env.HOME;

    if (!homeFolder) {
      _logger.default.info('The HOME folder path cannot be determined');

      return;
    }

    const currentUpgradeTimestamp = await (0, _utils.getWDAUpgradeTimestamp)();

    if (!_lodash.default.isInteger(currentUpgradeTimestamp)) {
      _logger.default.info('It is impossible to determine the timestamp of the package');

      return;
    }

    const timestampPath = _path.default.resolve(homeFolder, _constants.WDA_UPGRADE_TIMESTAMP_PATH);

    if (await _appiumSupport.fs.exists(timestampPath)) {
      try {
        await _appiumSupport.fs.access(timestampPath, _appiumSupport.fs.W_OK);
      } catch (ign) {
        _logger.default.info(`WebDriverAgent upgrade timestamp at '${timestampPath}' is not writeable. ` + `Skipping sources cleanup`);

        return;
      }

      const recentUpgradeTimestamp = parseInt(await _appiumSupport.fs.readFile(timestampPath, 'utf8'), 10);

      if (_lodash.default.isInteger(recentUpgradeTimestamp)) {
        if (recentUpgradeTimestamp >= currentUpgradeTimestamp) {
          _logger.default.info(`WebDriverAgent does not need a cleanup. The sources are up to date ` + `(${recentUpgradeTimestamp} >= ${currentUpgradeTimestamp})`);

          return;
        }

        _logger.default.info(`WebDriverAgent sources have been upgraded ` + `(${recentUpgradeTimestamp} < ${currentUpgradeTimestamp})`);
      } else {
        _logger.default.warn(`The recent upgrade timestamp at '${timestampPath}' is corrupted. Trying to fix it`);
      }
    }

    try {
      await (0, _appiumSupport.mkdirp)(_path.default.dirname(timestampPath));
      await _appiumSupport.fs.writeFile(timestampPath, `${currentUpgradeTimestamp}`, 'utf8');

      _logger.default.debug(`Stored the recent WebDriverAgent upgrade timestamp ${currentUpgradeTimestamp} ` + `at '${timestampPath}'`);
    } catch (e) {
      _logger.default.info(`Unable to create the recent WebDriverAgent upgrade timestamp at '${timestampPath}'. ` + `Original error: ${e.message}`);

      return;
    }

    try {
      await this.xcodebuild.cleanProject();
    } catch (e) {
      _logger.default.warn(`Cannot perform WebDriverAgent project cleanup. Original error: ${e.message}`);
    }
  }

  async launch(sessionId) {
    if (this.webDriverAgentUrl) {
      _logger.default.info(`Using provided WebdriverAgent at '${this.webDriverAgentUrl}'`);

      this.url = this.webDriverAgentUrl;
      this.setupProxies(sessionId);
      return await this.getStatus();
    }

    _logger.default.info('Launching WebDriverAgent on the device');

    this.setupProxies(sessionId);

    if (!this.useXctestrunFile && !(await _appiumSupport.fs.exists(this.agentPath))) {
      throw new Error(`Trying to use WebDriverAgent project at '${this.agentPath}' but the ` + 'file does not exist');
    }

    if (this.idb || this.useXctestrunFile || this.derivedDataPath && this.usePrebuiltWDA) {
      _logger.default.info('Skipped WDA project cleanup according to the provided capabilities');
    } else {
      const synchronizationKey = _path.default.normalize(this.bootstrapPath);

      await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => await this._cleanupProjectIfFresh());
    }

    await (0, _utils.resetTestProcesses)(this.device.udid, !this.isRealDevice);

    if (this.idb) {
      return await this.startWithIDB();
    }

    await this.xcodebuild.init(this.noSessionProxy);

    if (this.prebuildWDA) {
      await this.xcodebuild.prebuild();
    }

    return await this.xcodebuild.start();
  }

  async startWithIDB() {
    _logger.default.info('Will launch WDA with idb instead of xcodebuild since the corresponding flag is enabled');

    const {
      wdaBundleId,
      testBundleId
    } = await this.prepareWDA();
    const env = {
      USE_PORT: this.wdaRemotePort,
      WDA_PRODUCT_BUNDLE_IDENTIFIER: this.updatedWDABundleId
    };

    if (this.mjpegServerPort) {
      env.MJPEG_SERVER_PORT = this.mjpegServerPort;
    }

    return await this.idb.runXCUITest(wdaBundleId, wdaBundleId, testBundleId, {
      env
    });
  }

  async parseBundleId(wdaBundlePath) {
    const infoPlistPath = _path.default.join(wdaBundlePath, 'Info.plist');

    const infoPlist = await _appiumSupport.plist.parsePlist(await _appiumSupport.fs.readFile(infoPlistPath));

    if (!infoPlist.CFBundleIdentifier) {
      throw new Error(`Could not find bundle id in '${infoPlistPath}'`);
    }

    return infoPlist.CFBundleIdentifier;
  }

  async prepareWDA() {
    const wdaBundlePath = this.wdaBundlePath || (await this.fetchWDABundle());
    const wdaBundleId = await this.parseBundleId(wdaBundlePath);

    if (!(await this.device.isAppInstalled(wdaBundleId))) {
      await this.device.installApp(wdaBundlePath);
    }

    const testBundleId = await this.idb.installXCTestBundle(_path.default.join(wdaBundlePath, 'PlugIns', 'WebDriverAgentRunner.xctest'));
    return {
      wdaBundleId,
      testBundleId,
      wdaBundlePath
    };
  }

  async fetchWDABundle() {
    if (!this.derivedDataPath) {
      return await (0, _checkDependencies.bundleWDASim)(this.xcodebuild);
    }

    const wdaBundlePaths = await _appiumSupport.fs.glob(`${this.derivedDataPath}/**/*${_constants.WDA_RUNNER_APP}/`, {
      absolute: true
    });

    if (_lodash.default.isEmpty(wdaBundlePaths)) {
      throw new Error(`Could not find the WDA bundle in '${this.derivedDataPath}'`);
    }

    return wdaBundlePaths[0];
  }

  async isSourceFresh() {
    const existsPromises = ['Resources', `Resources${_path.default.sep}WebDriverAgent.bundle`].map(subPath => _appiumSupport.fs.exists(_path.default.resolve(this.bootstrapPath, subPath)));
    return (await _bluebird.default.all(existsPromises)).some(v => v === false);
  }

  setupProxies(sessionId) {
    const proxyOpts = {
      server: this.url.hostname,
      port: this.url.port,
      base: this.basePath,
      timeout: this.wdaConnectionTimeout,
      keepAlive: true
    };
    this.jwproxy = new _appiumBaseDriver.JWProxy(proxyOpts);
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
    this.noSessionProxy = new _noSessionProxy.NoSessionProxy(proxyOpts);
  }

  async quit() {
    _logger.default.info('Shutting down sub-processes');

    await this.xcodebuild.quit();
    await this.xcodebuild.reset();

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    this.started = false;

    if (!this.args.webDriverAgentUrl) {
      this.webDriverAgentUrl = null;
    }
  }

  get url() {
    if (!this._url) {
      if (this.webDriverAgentUrl) {
        this._url = _url2.default.parse(this.webDriverAgentUrl);
      } else {
        const port = this.wdaLocalPort || WDA_AGENT_PORT;

        const {
          protocol,
          hostname
        } = _url2.default.parse(this.wdaBaseUrl || _constants.WDA_BASE_URL);

        this._url = _url2.default.parse(`${protocol}//${hostname}:${port}`);
      }
    }

    return this._url;
  }

  set url(_url) {
    this._url = _url2.default.parse(_url);
  }

  get fullyStarted() {
    return this.started;
  }

  set fullyStarted(started = false) {
    this.started = started;
  }

  async retrieveDerivedDataPath() {
    return await this.xcodebuild.retrieveDerivedDataPath();
  }

  async setupCaching() {
    const status = await this.getStatus();

    if (!status || !status.build) {
      _logger.default.debug('WDA is currently not running. There is nothing to cache');

      return;
    }

    const {
      productBundleIdentifier,
      upgradedAt
    } = status.build;

    if (_appiumSupport.util.hasValue(productBundleIdentifier) && _appiumSupport.util.hasValue(this.updatedWDABundleId) && this.updatedWDABundleId !== productBundleIdentifier) {
      _logger.default.info(`Will uninstall running WDA since it has different bundle id. The actual value is '${productBundleIdentifier}'.`);

      return await this.uninstall();
    }

    if (_appiumSupport.util.hasValue(productBundleIdentifier) && !_appiumSupport.util.hasValue(this.updatedWDABundleId) && _constants.WDA_RUNNER_BUNDLE_ID !== productBundleIdentifier) {
      _logger.default.info(`Will uninstall running WDA since its bundle id is not equal to the default value ${_constants.WDA_RUNNER_BUNDLE_ID}`);

      return await this.uninstall();
    }

    const actualUpgradeTimestamp = await (0, _utils.getWDAUpgradeTimestamp)();

    _logger.default.debug(`Upgrade timestamp of the currently bundled WDA: ${actualUpgradeTimestamp}`);

    _logger.default.debug(`Upgrade timestamp of the WDA on the device: ${upgradedAt}`);

    if (actualUpgradeTimestamp && upgradedAt && _lodash.default.toLower(`${actualUpgradeTimestamp}`) !== _lodash.default.toLower(`${upgradedAt}`)) {
      _logger.default.info('Will uninstall running WDA since it has different version in comparison to the one ' + `which is bundled with appium-xcuitest-driver module (${actualUpgradeTimestamp} != ${upgradedAt})`);

      return await this.uninstall();
    }

    const message = _appiumSupport.util.hasValue(productBundleIdentifier) ? `Will reuse previously cached WDA instance at '${this.url.href}' with '${productBundleIdentifier}'` : `Will reuse previously cached WDA instance at '${this.url.href}'`;

    _logger.default.info(`${message}. Set the wdaLocalPort capability to a value different from ${this.url.port} if this is an undesired behavior.`);

    this.webDriverAgentUrl = this.url.href;
  }

  async quitAndUninstall() {
    await this.quit();
    await this.uninstall();
  }

}

exports.WebDriverAgent = WebDriverAgent;
var _default = WebDriverAgent;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliL3dlYmRyaXZlcmFnZW50LmpzIiwibmFtZXMiOlsiV0RBX0xBVU5DSF9USU1FT1VUIiwiV0RBX0FHRU5UX1BPUlQiLCJXREFfQ0ZfQlVORExFX05BTUUiLCJTSEFSRURfUkVTT1VSQ0VTX0dVQVJEIiwiQXN5bmNMb2NrIiwiV2ViRHJpdmVyQWdlbnQiLCJjb25zdHJ1Y3RvciIsInhjb2RlVmVyc2lvbiIsImFyZ3MiLCJfIiwiY2xvbmUiLCJkZXZpY2UiLCJwbGF0Zm9ybVZlcnNpb24iLCJwbGF0Zm9ybU5hbWUiLCJpb3NTZGtWZXJzaW9uIiwiaG9zdCIsImlzUmVhbERldmljZSIsInJlYWxEZXZpY2UiLCJpZGIiLCJ3ZGFCdW5kbGVQYXRoIiwic2V0V0RBUGF0aHMiLCJib290c3RyYXBQYXRoIiwiYWdlbnRQYXRoIiwid2RhTG9jYWxQb3J0Iiwid2RhUmVtb3RlUG9ydCIsIndkYUJhc2VVcmwiLCJXREFfQkFTRV9VUkwiLCJwcmVidWlsZFdEQSIsIndlYkRyaXZlckFnZW50VXJsIiwic3RhcnRlZCIsIndkYUNvbm5lY3Rpb25UaW1lb3V0IiwidXNlWGN0ZXN0cnVuRmlsZSIsInVzZVByZWJ1aWx0V0RBIiwiZGVyaXZlZERhdGFQYXRoIiwibWpwZWdTZXJ2ZXJQb3J0IiwidXBkYXRlZFdEQUJ1bmRsZUlkIiwieGNvZGVidWlsZCIsIlhjb2RlQnVpbGQiLCJzaG93WGNvZGVMb2ciLCJ4Y29kZUNvbmZpZ0ZpbGUiLCJ4Y29kZU9yZ0lkIiwieGNvZGVTaWduaW5nSWQiLCJrZXljaGFpblBhdGgiLCJrZXljaGFpblBhc3N3b3JkIiwidXNlU2ltcGxlQnVpbGRUZXN0IiwibGF1bmNoVGltZW91dCIsIndkYUxhdW5jaFRpbWVvdXQiLCJhbGxvd1Byb3Zpc2lvbmluZ0RldmljZVJlZ2lzdHJhdGlvbiIsInJlc3VsdEJ1bmRsZVBhdGgiLCJyZXN1bHRCdW5kbGVWZXJzaW9uIiwiQk9PVFNUUkFQX1BBVEgiLCJsb2ciLCJpbmZvIiwicGF0aCIsInJlc29sdmUiLCJjbGVhbnVwT2Jzb2xldGVQcm9jZXNzZXMiLCJvYnNvbGV0ZVBpZHMiLCJnZXRQSURzTGlzdGVuaW5nT25Qb3J0IiwidXJsIiwicG9ydCIsImNtZExpbmUiLCJpbmNsdWRlcyIsInRvTG93ZXJDYXNlIiwidWRpZCIsImlzRW1wdHkiLCJkZWJ1ZyIsImxlbmd0aCIsImV4ZWMiLCJlIiwid2FybiIsIm1lc3NhZ2UiLCJpc1J1bm5pbmciLCJnZXRTdGF0dXMiLCJiYXNlUGF0aCIsIm5vU2Vzc2lvblByb3h5IiwiTm9TZXNzaW9uUHJveHkiLCJzZXJ2ZXIiLCJob3N0bmFtZSIsImJhc2UiLCJ0aW1lb3V0IiwiY29tbWFuZCIsImVyciIsImhyZWYiLCJ1bmluc3RhbGwiLCJidW5kbGVJZHMiLCJnZXRVc2VySW5zdGFsbGVkQnVuZGxlSWRzQnlCdW5kbGVOYW1lIiwiYnVuZGxlSWQiLCJyZW1vdmVBcHAiLCJfY2xlYW51cFByb2plY3RJZkZyZXNoIiwiaG9tZUZvbGRlciIsInByb2Nlc3MiLCJlbnYiLCJIT01FIiwiY3VycmVudFVwZ3JhZGVUaW1lc3RhbXAiLCJnZXRXREFVcGdyYWRlVGltZXN0YW1wIiwiaXNJbnRlZ2VyIiwidGltZXN0YW1wUGF0aCIsIldEQV9VUEdSQURFX1RJTUVTVEFNUF9QQVRIIiwiZnMiLCJleGlzdHMiLCJhY2Nlc3MiLCJXX09LIiwiaWduIiwicmVjZW50VXBncmFkZVRpbWVzdGFtcCIsInBhcnNlSW50IiwicmVhZEZpbGUiLCJta2RpcnAiLCJkaXJuYW1lIiwid3JpdGVGaWxlIiwiY2xlYW5Qcm9qZWN0IiwibGF1bmNoIiwic2Vzc2lvbklkIiwic2V0dXBQcm94aWVzIiwiRXJyb3IiLCJzeW5jaHJvbml6YXRpb25LZXkiLCJub3JtYWxpemUiLCJhY3F1aXJlIiwicmVzZXRUZXN0UHJvY2Vzc2VzIiwic3RhcnRXaXRoSURCIiwiaW5pdCIsInByZWJ1aWxkIiwic3RhcnQiLCJ3ZGFCdW5kbGVJZCIsInRlc3RCdW5kbGVJZCIsInByZXBhcmVXREEiLCJVU0VfUE9SVCIsIldEQV9QUk9EVUNUX0JVTkRMRV9JREVOVElGSUVSIiwiTUpQRUdfU0VSVkVSX1BPUlQiLCJydW5YQ1VJVGVzdCIsInBhcnNlQnVuZGxlSWQiLCJpbmZvUGxpc3RQYXRoIiwiam9pbiIsImluZm9QbGlzdCIsInBsaXN0IiwicGFyc2VQbGlzdCIsIkNGQnVuZGxlSWRlbnRpZmllciIsImZldGNoV0RBQnVuZGxlIiwiaXNBcHBJbnN0YWxsZWQiLCJpbnN0YWxsQXBwIiwiaW5zdGFsbFhDVGVzdEJ1bmRsZSIsImJ1bmRsZVdEQVNpbSIsIndkYUJ1bmRsZVBhdGhzIiwiZ2xvYiIsIldEQV9SVU5ORVJfQVBQIiwiYWJzb2x1dGUiLCJpc1NvdXJjZUZyZXNoIiwiZXhpc3RzUHJvbWlzZXMiLCJzZXAiLCJtYXAiLCJzdWJQYXRoIiwiQiIsImFsbCIsInNvbWUiLCJ2IiwicHJveHlPcHRzIiwia2VlcEFsaXZlIiwiandwcm94eSIsIkpXUHJveHkiLCJwcm94eVJlcVJlcyIsImJpbmQiLCJxdWl0IiwicmVzZXQiLCJfdXJsIiwicGFyc2UiLCJwcm90b2NvbCIsImZ1bGx5U3RhcnRlZCIsInJldHJpZXZlRGVyaXZlZERhdGFQYXRoIiwic2V0dXBDYWNoaW5nIiwic3RhdHVzIiwiYnVpbGQiLCJwcm9kdWN0QnVuZGxlSWRlbnRpZmllciIsInVwZ3JhZGVkQXQiLCJ1dGlsIiwiaGFzVmFsdWUiLCJXREFfUlVOTkVSX0JVTkRMRV9JRCIsImFjdHVhbFVwZ3JhZGVUaW1lc3RhbXAiLCJ0b0xvd2VyIiwicXVpdEFuZFVuaW5zdGFsbCJdLCJzb3VyY2VSb290IjoiLi4vLi4iLCJzb3VyY2VzIjpbImxpYi93ZWJkcml2ZXJhZ2VudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgQiBmcm9tICdibHVlYmlyZCc7XG5pbXBvcnQgeyBKV1Byb3h5IH0gZnJvbSAnYXBwaXVtLWJhc2UtZHJpdmVyJztcbmltcG9ydCB7IGZzLCB1dGlsLCBwbGlzdCwgbWtkaXJwIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBOb1Nlc3Npb25Qcm94eSB9IGZyb20gJy4vbm8tc2Vzc2lvbi1wcm94eSc7XG5pbXBvcnQge1xuICBnZXRXREFVcGdyYWRlVGltZXN0YW1wLCByZXNldFRlc3RQcm9jZXNzZXMsIGdldFBJRHNMaXN0ZW5pbmdPblBvcnRcbn0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgWGNvZGVCdWlsZCBmcm9tICcuL3hjb2RlYnVpbGQnO1xuaW1wb3J0IEFzeW5jTG9jayBmcm9tICdhc3luYy1sb2NrJztcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICd0ZWVuX3Byb2Nlc3MnO1xuaW1wb3J0IHsgYnVuZGxlV0RBU2ltIH0gZnJvbSAnLi9jaGVjay1kZXBlbmRlbmNpZXMnO1xuaW1wb3J0IHtcbiAgQk9PVFNUUkFQX1BBVEgsIFdEQV9SVU5ORVJfQlVORExFX0lELCBXREFfUlVOTkVSX0FQUCxcbiAgV0RBX0JBU0VfVVJMLCBXREFfVVBHUkFERV9USU1FU1RBTVBfUEFUSCxcbn0gZnJvbSAnLi9jb25zdGFudHMnO1xuXG5jb25zdCBXREFfTEFVTkNIX1RJTUVPVVQgPSA2MCAqIDEwMDA7XG5jb25zdCBXREFfQUdFTlRfUE9SVCA9IDgxMDA7XG5jb25zdCBXREFfQ0ZfQlVORExFX05BTUUgPSAnV2ViRHJpdmVyQWdlbnRSdW5uZXItUnVubmVyJztcbmNvbnN0IFNIQVJFRF9SRVNPVVJDRVNfR1VBUkQgPSBuZXcgQXN5bmNMb2NrKCk7XG5cbmNsYXNzIFdlYkRyaXZlckFnZW50IHtcbiAgY29uc3RydWN0b3IgKHhjb2RlVmVyc2lvbiwgYXJncyA9IHt9KSB7XG4gICAgdGhpcy54Y29kZVZlcnNpb24gPSB4Y29kZVZlcnNpb247XG5cbiAgICB0aGlzLmFyZ3MgPSBfLmNsb25lKGFyZ3MpO1xuXG4gICAgdGhpcy5kZXZpY2UgPSBhcmdzLmRldmljZTtcbiAgICB0aGlzLnBsYXRmb3JtVmVyc2lvbiA9IGFyZ3MucGxhdGZvcm1WZXJzaW9uO1xuICAgIHRoaXMucGxhdGZvcm1OYW1lID0gYXJncy5wbGF0Zm9ybU5hbWU7XG4gICAgdGhpcy5pb3NTZGtWZXJzaW9uID0gYXJncy5pb3NTZGtWZXJzaW9uO1xuICAgIHRoaXMuaG9zdCA9IGFyZ3MuaG9zdDtcbiAgICB0aGlzLmlzUmVhbERldmljZSA9ICEhYXJncy5yZWFsRGV2aWNlO1xuICAgIHRoaXMuaWRiID0gKGFyZ3MuZGV2aWNlIHx8IHt9KS5pZGI7XG4gICAgdGhpcy53ZGFCdW5kbGVQYXRoID0gYXJncy53ZGFCdW5kbGVQYXRoO1xuXG4gICAgdGhpcy5zZXRXREFQYXRocyhhcmdzLmJvb3RzdHJhcFBhdGgsIGFyZ3MuYWdlbnRQYXRoKTtcblxuICAgIHRoaXMud2RhTG9jYWxQb3J0ID0gYXJncy53ZGFMb2NhbFBvcnQ7XG4gICAgdGhpcy53ZGFSZW1vdGVQb3J0ID0gYXJncy53ZGFMb2NhbFBvcnQgfHwgV0RBX0FHRU5UX1BPUlQ7XG4gICAgdGhpcy53ZGFCYXNlVXJsID0gYXJncy53ZGFCYXNlVXJsIHx8IFdEQV9CQVNFX1VSTDtcblxuICAgIHRoaXMucHJlYnVpbGRXREEgPSBhcmdzLnByZWJ1aWxkV0RBO1xuXG4gICAgdGhpcy53ZWJEcml2ZXJBZ2VudFVybCA9IGFyZ3Mud2ViRHJpdmVyQWdlbnRVcmw7XG5cbiAgICB0aGlzLnN0YXJ0ZWQgPSBmYWxzZTtcblxuICAgIHRoaXMud2RhQ29ubmVjdGlvblRpbWVvdXQgPSBhcmdzLndkYUNvbm5lY3Rpb25UaW1lb3V0O1xuXG4gICAgdGhpcy51c2VYY3Rlc3RydW5GaWxlID0gYXJncy51c2VYY3Rlc3RydW5GaWxlO1xuICAgIHRoaXMudXNlUHJlYnVpbHRXREEgPSBhcmdzLnVzZVByZWJ1aWx0V0RBO1xuICAgIHRoaXMuZGVyaXZlZERhdGFQYXRoID0gYXJncy5kZXJpdmVkRGF0YVBhdGg7XG4gICAgdGhpcy5tanBlZ1NlcnZlclBvcnQgPSBhcmdzLm1qcGVnU2VydmVyUG9ydDtcblxuICAgIHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkID0gYXJncy51cGRhdGVkV0RBQnVuZGxlSWQ7XG5cbiAgICB0aGlzLnhjb2RlYnVpbGQgPSBuZXcgWGNvZGVCdWlsZCh0aGlzLnhjb2RlVmVyc2lvbiwgdGhpcy5kZXZpY2UsIHtcbiAgICAgIHBsYXRmb3JtVmVyc2lvbjogdGhpcy5wbGF0Zm9ybVZlcnNpb24sXG4gICAgICBwbGF0Zm9ybU5hbWU6IHRoaXMucGxhdGZvcm1OYW1lLFxuICAgICAgaW9zU2RrVmVyc2lvbjogdGhpcy5pb3NTZGtWZXJzaW9uLFxuICAgICAgYWdlbnRQYXRoOiB0aGlzLmFnZW50UGF0aCxcbiAgICAgIGJvb3RzdHJhcFBhdGg6IHRoaXMuYm9vdHN0cmFwUGF0aCxcbiAgICAgIHJlYWxEZXZpY2U6IHRoaXMuaXNSZWFsRGV2aWNlLFxuICAgICAgc2hvd1hjb2RlTG9nOiBhcmdzLnNob3dYY29kZUxvZyxcbiAgICAgIHhjb2RlQ29uZmlnRmlsZTogYXJncy54Y29kZUNvbmZpZ0ZpbGUsXG4gICAgICB4Y29kZU9yZ0lkOiBhcmdzLnhjb2RlT3JnSWQsXG4gICAgICB4Y29kZVNpZ25pbmdJZDogYXJncy54Y29kZVNpZ25pbmdJZCxcbiAgICAgIGtleWNoYWluUGF0aDogYXJncy5rZXljaGFpblBhdGgsXG4gICAgICBrZXljaGFpblBhc3N3b3JkOiBhcmdzLmtleWNoYWluUGFzc3dvcmQsXG4gICAgICB1c2VTaW1wbGVCdWlsZFRlc3Q6IGFyZ3MudXNlU2ltcGxlQnVpbGRUZXN0LFxuICAgICAgdXNlUHJlYnVpbHRXREE6IGFyZ3MudXNlUHJlYnVpbHRXREEsXG4gICAgICB1cGRhdGVkV0RBQnVuZGxlSWQ6IHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkLFxuICAgICAgbGF1bmNoVGltZW91dDogYXJncy53ZGFMYXVuY2hUaW1lb3V0IHx8IFdEQV9MQVVOQ0hfVElNRU9VVCxcbiAgICAgIHdkYVJlbW90ZVBvcnQ6IHRoaXMud2RhUmVtb3RlUG9ydCxcbiAgICAgIHVzZVhjdGVzdHJ1bkZpbGU6IHRoaXMudXNlWGN0ZXN0cnVuRmlsZSxcbiAgICAgIGRlcml2ZWREYXRhUGF0aDogYXJncy5kZXJpdmVkRGF0YVBhdGgsXG4gICAgICBtanBlZ1NlcnZlclBvcnQ6IHRoaXMubWpwZWdTZXJ2ZXJQb3J0LFxuICAgICAgYWxsb3dQcm92aXNpb25pbmdEZXZpY2VSZWdpc3RyYXRpb246IGFyZ3MuYWxsb3dQcm92aXNpb25pbmdEZXZpY2VSZWdpc3RyYXRpb24sXG4gICAgICByZXN1bHRCdW5kbGVQYXRoOiBhcmdzLnJlc3VsdEJ1bmRsZVBhdGgsXG4gICAgICByZXN1bHRCdW5kbGVWZXJzaW9uOiBhcmdzLnJlc3VsdEJ1bmRsZVZlcnNpb24sXG4gICAgfSk7XG4gIH1cblxuICBzZXRXREFQYXRocyAoYm9vdHN0cmFwUGF0aCwgYWdlbnRQYXRoKSB7XG4gICAgLy8gYWxsb3cgdGhlIHVzZXIgdG8gc3BlY2lmeSBhIHBsYWNlIGZvciBXREEuIFRoaXMgaXMgdW5kb2N1bWVudGVkIGFuZFxuICAgIC8vIG9ubHkgaGVyZSBmb3IgdGhlIHB1cnBvc2VzIG9mIHRlc3RpbmcgZGV2ZWxvcG1lbnQgb2YgV0RBXG4gICAgdGhpcy5ib290c3RyYXBQYXRoID0gYm9vdHN0cmFwUGF0aCB8fCBCT09UU1RSQVBfUEFUSDtcbiAgICBsb2cuaW5mbyhgVXNpbmcgV0RBIHBhdGg6ICcke3RoaXMuYm9vdHN0cmFwUGF0aH0nYCk7XG5cbiAgICAvLyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSB3ZSBuZWVkIHRvIGJlIGFibGUgdG8gc3BlY2lmeSBhZ2VudFBhdGggdG9vXG4gICAgdGhpcy5hZ2VudFBhdGggPSBhZ2VudFBhdGggfHwgcGF0aC5yZXNvbHZlKHRoaXMuYm9vdHN0cmFwUGF0aCwgJ1dlYkRyaXZlckFnZW50Lnhjb2RlcHJvaicpO1xuICAgIGxvZy5pbmZvKGBVc2luZyBXREEgYWdlbnQ6ICcke3RoaXMuYWdlbnRQYXRofSdgKTtcbiAgfVxuXG4gIGFzeW5jIGNsZWFudXBPYnNvbGV0ZVByb2Nlc3NlcyAoKSB7XG4gICAgY29uc3Qgb2Jzb2xldGVQaWRzID0gYXdhaXQgZ2V0UElEc0xpc3RlbmluZ09uUG9ydCh0aGlzLnVybC5wb3J0LFxuICAgICAgKGNtZExpbmUpID0+IGNtZExpbmUuaW5jbHVkZXMoJy9XZWJEcml2ZXJBZ2VudFJ1bm5lcicpICYmXG4gICAgICAgICFjbWRMaW5lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGhpcy5kZXZpY2UudWRpZC50b0xvd2VyQ2FzZSgpKSk7XG5cbiAgICBpZiAoXy5pc0VtcHR5KG9ic29sZXRlUGlkcykpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgTm8gb2Jzb2xldGUgY2FjaGVkIHByb2Nlc3NlcyBmcm9tIHByZXZpb3VzIFdEQSBzZXNzaW9ucyBgICtcbiAgICAgICAgYGxpc3RlbmluZyBvbiBwb3J0ICR7dGhpcy51cmwucG9ydH0gaGF2ZSBiZWVuIGZvdW5kYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9nLmluZm8oYERldGVjdGVkICR7b2Jzb2xldGVQaWRzLmxlbmd0aH0gb2Jzb2xldGUgY2FjaGVkIHByb2Nlc3Mke29ic29sZXRlUGlkcy5sZW5ndGggPT09IDEgPyAnJyA6ICdlcyd9IGAgK1xuICAgICAgYGZyb20gcHJldmlvdXMgV0RBIHNlc3Npb25zLiBDbGVhbmluZyB0aGVtIHVwYCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWMoJ2tpbGwnLCBvYnNvbGV0ZVBpZHMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZy53YXJuKGBGYWlsZWQgdG8ga2lsbCBvYnNvbGV0ZSBjYWNoZWQgcHJvY2VzcyR7b2Jzb2xldGVQaWRzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ2VzJ30gJyR7b2Jzb2xldGVQaWRzfScuIGAgK1xuICAgICAgICBgT3JpZ2luYWwgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm4gYm9vbGVhbiBpZiBXREEgaXMgcnVubmluZyBvciBub3RcbiAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiBXREEgaXMgcnVubmluZ1xuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlcmUgd2FzIGludmFsaWQgcmVzcG9uc2UgY29kZSBvciBib2R5XG4gICAqL1xuICBhc3luYyBpc1J1bm5pbmcgKCkge1xuICAgIHJldHVybiAhIShhd2FpdCB0aGlzLmdldFN0YXR1cygpKTtcbiAgfVxuXG4gIGdldCBiYXNlUGF0aCAoKSB7XG4gICAgaWYgKHRoaXMudXJsLnBhdGggPT09ICcvJykge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy51cmwucGF0aCB8fCAnJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm4gY3VycmVudCBydW5uaW5nIFdEQSdzIHN0YXR1cyBsaWtlIGJlbG93XG4gICAqIHtcbiAgICogICBcInN0YXRlXCI6IFwic3VjY2Vzc1wiLFxuICAgKiAgIFwib3NcIjoge1xuICAgKiAgICAgXCJuYW1lXCI6IFwiaU9TXCIsXG4gICAqICAgICBcInZlcnNpb25cIjogXCIxMS40XCIsXG4gICAqICAgICBcInNka1ZlcnNpb25cIjogXCIxMS4zXCJcbiAgICogICB9LFxuICAgKiAgIFwiaW9zXCI6IHtcbiAgICogICAgIFwic2ltdWxhdG9yVmVyc2lvblwiOiBcIjExLjRcIixcbiAgICogICAgIFwiaXBcIjogXCIxNzIuMjU0Ljk5LjM0XCJcbiAgICogICB9LFxuICAgKiAgIFwiYnVpbGRcIjoge1xuICAgKiAgICAgXCJ0aW1lXCI6IFwiSnVuIDI0IDIwMTggMTc6MDg6MjFcIixcbiAgICogICAgIFwicHJvZHVjdEJ1bmRsZUlkZW50aWZpZXJcIjogXCJjb20uZmFjZWJvb2suV2ViRHJpdmVyQWdlbnRSdW5uZXJcIlxuICAgKiAgIH1cbiAgICogfVxuICAgKlxuICAgKiBAcmV0dXJuIHs/b2JqZWN0fSBTdGF0ZSBPYmplY3RcbiAgICogQHRocm93cyB7RXJyb3J9IElmIHRoZXJlIHdhcyBpbnZhbGlkIHJlc3BvbnNlIGNvZGUgb3IgYm9keVxuICAgKi9cbiAgYXN5bmMgZ2V0U3RhdHVzICgpIHtcbiAgICBjb25zdCBub1Nlc3Npb25Qcm94eSA9IG5ldyBOb1Nlc3Npb25Qcm94eSh7XG4gICAgICBzZXJ2ZXI6IHRoaXMudXJsLmhvc3RuYW1lLFxuICAgICAgcG9ydDogdGhpcy51cmwucG9ydCxcbiAgICAgIGJhc2U6IHRoaXMuYmFzZVBhdGgsXG4gICAgICB0aW1lb3V0OiAzMDAwLFxuICAgIH0pO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgbm9TZXNzaW9uUHJveHkuY29tbWFuZCgnL3N0YXR1cycsICdHRVQnKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy5kZWJ1ZyhgV0RBIGlzIG5vdCBsaXN0ZW5pbmcgYXQgJyR7dGhpcy51cmwuaHJlZn0nYCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVW5pbnN0YWxsIFdEQXMgZnJvbSB0aGUgdGVzdCBkZXZpY2UuXG4gICAqIE92ZXIgWGNvZGUgMTEsIG11bHRpcGxlIFdEQSBjYW4gYmUgaW4gdGhlIGRldmljZSBzaW5jZSBYY29kZSAxMSBnZW5lcmF0ZXMgZGlmZmVyZW50IFdEQS5cbiAgICogQXBwaXVtIGRvZXMgbm90IGV4cGVjdCBtdWx0aXBsZSBXREFzIGFyZSBydW5uaW5nIG9uIGEgZGV2aWNlLlxuICAgKi9cbiAgYXN5bmMgdW5pbnN0YWxsICgpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYnVuZGxlSWRzID0gYXdhaXQgdGhpcy5kZXZpY2UuZ2V0VXNlckluc3RhbGxlZEJ1bmRsZUlkc0J5QnVuZGxlTmFtZShXREFfQ0ZfQlVORExFX05BTUUpO1xuICAgICAgaWYgKF8uaXNFbXB0eShidW5kbGVJZHMpKSB7XG4gICAgICAgIGxvZy5kZWJ1ZygnTm8gV0RBcyBvbiB0aGUgZGV2aWNlLicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGxvZy5kZWJ1ZyhgVW5pbnN0YWxsaW5nIFdEQXM6ICcke2J1bmRsZUlkc30nYCk7XG4gICAgICBmb3IgKGNvbnN0IGJ1bmRsZUlkIG9mIGJ1bmRsZUlkcykge1xuICAgICAgICBhd2FpdCB0aGlzLmRldmljZS5yZW1vdmVBcHAoYnVuZGxlSWQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZy5kZWJ1ZyhlKTtcbiAgICAgIGxvZy53YXJuKGBXZWJEcml2ZXJBZ2VudCB1bmluc3RhbGwgZmFpbGVkLiBQZXJoYXBzLCBpdCBpcyBhbHJlYWR5IHVuaW5zdGFsbGVkPyBgICtcbiAgICAgICAgYE9yaWdpbmFsIGVycm9yOiAke2UubWVzc2FnZX1gKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBfY2xlYW51cFByb2plY3RJZkZyZXNoICgpIHtcbiAgICBjb25zdCBob21lRm9sZGVyID0gcHJvY2Vzcy5lbnYuSE9NRTtcbiAgICBpZiAoIWhvbWVGb2xkZXIpIHtcbiAgICAgIGxvZy5pbmZvKCdUaGUgSE9NRSBmb2xkZXIgcGF0aCBjYW5ub3QgYmUgZGV0ZXJtaW5lZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnJlbnRVcGdyYWRlVGltZXN0YW1wID0gYXdhaXQgZ2V0V0RBVXBncmFkZVRpbWVzdGFtcCgpO1xuICAgIGlmICghXy5pc0ludGVnZXIoY3VycmVudFVwZ3JhZGVUaW1lc3RhbXApKSB7XG4gICAgICBsb2cuaW5mbygnSXQgaXMgaW1wb3NzaWJsZSB0byBkZXRlcm1pbmUgdGhlIHRpbWVzdGFtcCBvZiB0aGUgcGFja2FnZScpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRpbWVzdGFtcFBhdGggPSBwYXRoLnJlc29sdmUoaG9tZUZvbGRlciwgV0RBX1VQR1JBREVfVElNRVNUQU1QX1BBVEgpO1xuICAgIGlmIChhd2FpdCBmcy5leGlzdHModGltZXN0YW1wUGF0aCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGZzLmFjY2Vzcyh0aW1lc3RhbXBQYXRoLCBmcy5XX09LKTtcbiAgICAgIH0gY2F0Y2ggKGlnbikge1xuICAgICAgICBsb2cuaW5mbyhgV2ViRHJpdmVyQWdlbnQgdXBncmFkZSB0aW1lc3RhbXAgYXQgJyR7dGltZXN0YW1wUGF0aH0nIGlzIG5vdCB3cml0ZWFibGUuIGAgK1xuICAgICAgICAgIGBTa2lwcGluZyBzb3VyY2VzIGNsZWFudXBgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVjZW50VXBncmFkZVRpbWVzdGFtcCA9IHBhcnNlSW50KGF3YWl0IGZzLnJlYWRGaWxlKHRpbWVzdGFtcFBhdGgsICd1dGY4JyksIDEwKTtcbiAgICAgIGlmIChfLmlzSW50ZWdlcihyZWNlbnRVcGdyYWRlVGltZXN0YW1wKSkge1xuICAgICAgICBpZiAocmVjZW50VXBncmFkZVRpbWVzdGFtcCA+PSBjdXJyZW50VXBncmFkZVRpbWVzdGFtcCkge1xuICAgICAgICAgIGxvZy5pbmZvKGBXZWJEcml2ZXJBZ2VudCBkb2VzIG5vdCBuZWVkIGEgY2xlYW51cC4gVGhlIHNvdXJjZXMgYXJlIHVwIHRvIGRhdGUgYCArXG4gICAgICAgICAgICBgKCR7cmVjZW50VXBncmFkZVRpbWVzdGFtcH0gPj0gJHtjdXJyZW50VXBncmFkZVRpbWVzdGFtcH0pYCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxvZy5pbmZvKGBXZWJEcml2ZXJBZ2VudCBzb3VyY2VzIGhhdmUgYmVlbiB1cGdyYWRlZCBgICtcbiAgICAgICAgICBgKCR7cmVjZW50VXBncmFkZVRpbWVzdGFtcH0gPCAke2N1cnJlbnRVcGdyYWRlVGltZXN0YW1wfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZy53YXJuKGBUaGUgcmVjZW50IHVwZ3JhZGUgdGltZXN0YW1wIGF0ICcke3RpbWVzdGFtcFBhdGh9JyBpcyBjb3JydXB0ZWQuIFRyeWluZyB0byBmaXggaXRgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgbWtkaXJwKHBhdGguZGlybmFtZSh0aW1lc3RhbXBQYXRoKSk7XG4gICAgICBhd2FpdCBmcy53cml0ZUZpbGUodGltZXN0YW1wUGF0aCwgYCR7Y3VycmVudFVwZ3JhZGVUaW1lc3RhbXB9YCwgJ3V0ZjgnKTtcbiAgICAgIGxvZy5kZWJ1ZyhgU3RvcmVkIHRoZSByZWNlbnQgV2ViRHJpdmVyQWdlbnQgdXBncmFkZSB0aW1lc3RhbXAgJHtjdXJyZW50VXBncmFkZVRpbWVzdGFtcH0gYCArXG4gICAgICAgIGBhdCAnJHt0aW1lc3RhbXBQYXRofSdgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2cuaW5mbyhgVW5hYmxlIHRvIGNyZWF0ZSB0aGUgcmVjZW50IFdlYkRyaXZlckFnZW50IHVwZ3JhZGUgdGltZXN0YW1wIGF0ICcke3RpbWVzdGFtcFBhdGh9Jy4gYCArXG4gICAgICAgIGBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMueGNvZGVidWlsZC5jbGVhblByb2plY3QoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2cud2FybihgQ2Fubm90IHBlcmZvcm0gV2ViRHJpdmVyQWdlbnQgcHJvamVjdCBjbGVhbnVwLiBPcmlnaW5hbCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybiBjdXJyZW50IHJ1bm5pbmcgV0RBJ3Mgc3RhdHVzIGxpa2UgYmVsb3cgYWZ0ZXIgbGF1bmNoaW5nIFdEQVxuICAgKiB7XG4gICAqICAgXCJzdGF0ZVwiOiBcInN1Y2Nlc3NcIixcbiAgICogICBcIm9zXCI6IHtcbiAgICogICAgIFwibmFtZVwiOiBcImlPU1wiLFxuICAgKiAgICAgXCJ2ZXJzaW9uXCI6IFwiMTEuNFwiLFxuICAgKiAgICAgXCJzZGtWZXJzaW9uXCI6IFwiMTEuM1wiXG4gICAqICAgfSxcbiAgICogICBcImlvc1wiOiB7XG4gICAqICAgICBcInNpbXVsYXRvclZlcnNpb25cIjogXCIxMS40XCIsXG4gICAqICAgICBcImlwXCI6IFwiMTcyLjI1NC45OS4zNFwiXG4gICAqICAgfSxcbiAgICogICBcImJ1aWxkXCI6IHtcbiAgICogICAgIFwidGltZVwiOiBcIkp1biAyNCAyMDE4IDE3OjA4OjIxXCIsXG4gICAqICAgICBcInByb2R1Y3RCdW5kbGVJZGVudGlmaWVyXCI6IFwiY29tLmZhY2Vib29rLldlYkRyaXZlckFnZW50UnVubmVyXCJcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IHNlc3Npb25JZCBMYXVuY2ggV0RBIGFuZCBlc3RhYmxpc2ggdGhlIHNlc3Npb24gd2l0aCB0aGlzIHNlc3Npb25JZFxuICAgKiBAcmV0dXJuIHs/b2JqZWN0fSBTdGF0ZSBPYmplY3RcbiAgICogQHRocm93cyB7RXJyb3J9IElmIHRoZXJlIHdhcyBpbnZhbGlkIHJlc3BvbnNlIGNvZGUgb3IgYm9keVxuICAgKi9cbiAgYXN5bmMgbGF1bmNoIChzZXNzaW9uSWQpIHtcbiAgICBpZiAodGhpcy53ZWJEcml2ZXJBZ2VudFVybCkge1xuICAgICAgbG9nLmluZm8oYFVzaW5nIHByb3ZpZGVkIFdlYmRyaXZlckFnZW50IGF0ICcke3RoaXMud2ViRHJpdmVyQWdlbnRVcmx9J2ApO1xuICAgICAgdGhpcy51cmwgPSB0aGlzLndlYkRyaXZlckFnZW50VXJsO1xuICAgICAgdGhpcy5zZXR1cFByb3hpZXMoc2Vzc2lvbklkKTtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFN0YXR1cygpO1xuICAgIH1cblxuICAgIGxvZy5pbmZvKCdMYXVuY2hpbmcgV2ViRHJpdmVyQWdlbnQgb24gdGhlIGRldmljZScpO1xuXG4gICAgdGhpcy5zZXR1cFByb3hpZXMoc2Vzc2lvbklkKTtcblxuICAgIGlmICghdGhpcy51c2VYY3Rlc3RydW5GaWxlICYmICFhd2FpdCBmcy5leGlzdHModGhpcy5hZ2VudFBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFRyeWluZyB0byB1c2UgV2ViRHJpdmVyQWdlbnQgcHJvamVjdCBhdCAnJHt0aGlzLmFnZW50UGF0aH0nIGJ1dCB0aGUgYCArXG4gICAgICAgICAgICAgICAgICAgICAgJ2ZpbGUgZG9lcyBub3QgZXhpc3QnKTtcbiAgICB9XG5cbiAgICAvLyB1c2VYY3Rlc3RydW5GaWxlIGFuZCB1c2VQcmVidWlsdFdEQSB1c2UgZXhpc3RpbmcgZGVwZW5kZW5jaWVzXG4gICAgLy8gSXQgZGVwZW5kcyBvbiB1c2VyIHNpZGVcbiAgICBpZiAodGhpcy5pZGIgfHwgdGhpcy51c2VYY3Rlc3RydW5GaWxlIHx8ICh0aGlzLmRlcml2ZWREYXRhUGF0aCAmJiB0aGlzLnVzZVByZWJ1aWx0V0RBKSkge1xuICAgICAgbG9nLmluZm8oJ1NraXBwZWQgV0RBIHByb2plY3QgY2xlYW51cCBhY2NvcmRpbmcgdG8gdGhlIHByb3ZpZGVkIGNhcGFiaWxpdGllcycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzeW5jaHJvbml6YXRpb25LZXkgPSBwYXRoLm5vcm1hbGl6ZSh0aGlzLmJvb3RzdHJhcFBhdGgpO1xuICAgICAgYXdhaXQgU0hBUkVEX1JFU09VUkNFU19HVUFSRC5hY3F1aXJlKHN5bmNocm9uaXphdGlvbktleSxcbiAgICAgICAgYXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5fY2xlYW51cFByb2plY3RJZkZyZXNoKCkpO1xuICAgIH1cblxuICAgIC8vIFdlIG5lZWQgdG8gcHJvdmlkZSBXREEgbG9jYWwgcG9ydCwgYmVjYXVzZSBpdCBtaWdodCBiZSBvY2N1cGllZFxuICAgIGF3YWl0IHJlc2V0VGVzdFByb2Nlc3Nlcyh0aGlzLmRldmljZS51ZGlkLCAhdGhpcy5pc1JlYWxEZXZpY2UpO1xuXG4gICAgaWYgKHRoaXMuaWRiKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5zdGFydFdpdGhJREIoKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLnhjb2RlYnVpbGQuaW5pdCh0aGlzLm5vU2Vzc2lvblByb3h5KTtcblxuICAgIC8vIFN0YXJ0IHRoZSB4Y29kZWJ1aWxkIHByb2Nlc3NcbiAgICBpZiAodGhpcy5wcmVidWlsZFdEQSkge1xuICAgICAgYXdhaXQgdGhpcy54Y29kZWJ1aWxkLnByZWJ1aWxkKCk7XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCB0aGlzLnhjb2RlYnVpbGQuc3RhcnQoKTtcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0V2l0aElEQiAoKSB7XG4gICAgbG9nLmluZm8oJ1dpbGwgbGF1bmNoIFdEQSB3aXRoIGlkYiBpbnN0ZWFkIG9mIHhjb2RlYnVpbGQgc2luY2UgdGhlIGNvcnJlc3BvbmRpbmcgZmxhZyBpcyBlbmFibGVkJyk7XG4gICAgY29uc3Qge3dkYUJ1bmRsZUlkLCB0ZXN0QnVuZGxlSWR9ID0gYXdhaXQgdGhpcy5wcmVwYXJlV0RBKCk7XG4gICAgY29uc3QgZW52ID0ge1xuICAgICAgVVNFX1BPUlQ6IHRoaXMud2RhUmVtb3RlUG9ydCxcbiAgICAgIFdEQV9QUk9EVUNUX0JVTkRMRV9JREVOVElGSUVSOiB0aGlzLnVwZGF0ZWRXREFCdW5kbGVJZCxcbiAgICB9O1xuICAgIGlmICh0aGlzLm1qcGVnU2VydmVyUG9ydCkge1xuICAgICAgZW52Lk1KUEVHX1NFUlZFUl9QT1JUID0gdGhpcy5tanBlZ1NlcnZlclBvcnQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuaWRiLnJ1blhDVUlUZXN0KHdkYUJ1bmRsZUlkLCB3ZGFCdW5kbGVJZCwgdGVzdEJ1bmRsZUlkLCB7ZW52fSk7XG4gIH1cblxuICBhc3luYyBwYXJzZUJ1bmRsZUlkICh3ZGFCdW5kbGVQYXRoKSB7XG4gICAgY29uc3QgaW5mb1BsaXN0UGF0aCA9IHBhdGguam9pbih3ZGFCdW5kbGVQYXRoLCAnSW5mby5wbGlzdCcpO1xuICAgIGNvbnN0IGluZm9QbGlzdCA9IGF3YWl0IHBsaXN0LnBhcnNlUGxpc3QoYXdhaXQgZnMucmVhZEZpbGUoaW5mb1BsaXN0UGF0aCkpO1xuICAgIGlmICghaW5mb1BsaXN0LkNGQnVuZGxlSWRlbnRpZmllcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCBidW5kbGUgaWQgaW4gJyR7aW5mb1BsaXN0UGF0aH0nYCk7XG4gICAgfVxuICAgIHJldHVybiBpbmZvUGxpc3QuQ0ZCdW5kbGVJZGVudGlmaWVyO1xuICB9XG5cbiAgYXN5bmMgcHJlcGFyZVdEQSAoKSB7XG4gICAgY29uc3Qgd2RhQnVuZGxlUGF0aCA9IHRoaXMud2RhQnVuZGxlUGF0aCB8fCBhd2FpdCB0aGlzLmZldGNoV0RBQnVuZGxlKCk7XG4gICAgY29uc3Qgd2RhQnVuZGxlSWQgPSBhd2FpdCB0aGlzLnBhcnNlQnVuZGxlSWQod2RhQnVuZGxlUGF0aCk7XG4gICAgaWYgKCFhd2FpdCB0aGlzLmRldmljZS5pc0FwcEluc3RhbGxlZCh3ZGFCdW5kbGVJZCkpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGV2aWNlLmluc3RhbGxBcHAod2RhQnVuZGxlUGF0aCk7XG4gICAgfVxuICAgIGNvbnN0IHRlc3RCdW5kbGVJZCA9IGF3YWl0IHRoaXMuaWRiLmluc3RhbGxYQ1Rlc3RCdW5kbGUocGF0aC5qb2luKHdkYUJ1bmRsZVBhdGgsICdQbHVnSW5zJywgJ1dlYkRyaXZlckFnZW50UnVubmVyLnhjdGVzdCcpKTtcbiAgICByZXR1cm4ge3dkYUJ1bmRsZUlkLCB0ZXN0QnVuZGxlSWQsIHdkYUJ1bmRsZVBhdGh9O1xuICB9XG5cbiAgYXN5bmMgZmV0Y2hXREFCdW5kbGUgKCkge1xuICAgIGlmICghdGhpcy5kZXJpdmVkRGF0YVBhdGgpIHtcbiAgICAgIHJldHVybiBhd2FpdCBidW5kbGVXREFTaW0odGhpcy54Y29kZWJ1aWxkKTtcbiAgICB9XG4gICAgY29uc3Qgd2RhQnVuZGxlUGF0aHMgPSBhd2FpdCBmcy5nbG9iKGAke3RoaXMuZGVyaXZlZERhdGFQYXRofS8qKi8qJHtXREFfUlVOTkVSX0FQUH0vYCwge1xuICAgICAgYWJzb2x1dGU6IHRydWUsXG4gICAgfSk7XG4gICAgaWYgKF8uaXNFbXB0eSh3ZGFCdW5kbGVQYXRocykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgdGhlIFdEQSBidW5kbGUgaW4gJyR7dGhpcy5kZXJpdmVkRGF0YVBhdGh9J2ApO1xuICAgIH1cbiAgICByZXR1cm4gd2RhQnVuZGxlUGF0aHNbMF07XG4gIH1cblxuICBhc3luYyBpc1NvdXJjZUZyZXNoICgpIHtcbiAgICBjb25zdCBleGlzdHNQcm9taXNlcyA9IFtcbiAgICAgICdSZXNvdXJjZXMnLFxuICAgICAgYFJlc291cmNlcyR7cGF0aC5zZXB9V2ViRHJpdmVyQWdlbnQuYnVuZGxlYCxcbiAgICBdLm1hcCgoc3ViUGF0aCkgPT4gZnMuZXhpc3RzKHBhdGgucmVzb2x2ZSh0aGlzLmJvb3RzdHJhcFBhdGgsIHN1YlBhdGgpKSk7XG4gICAgcmV0dXJuIChhd2FpdCBCLmFsbChleGlzdHNQcm9taXNlcykpLnNvbWUoKHYpID0+IHYgPT09IGZhbHNlKTtcbiAgfVxuXG4gIHNldHVwUHJveGllcyAoc2Vzc2lvbklkKSB7XG4gICAgY29uc3QgcHJveHlPcHRzID0ge1xuICAgICAgc2VydmVyOiB0aGlzLnVybC5ob3N0bmFtZSxcbiAgICAgIHBvcnQ6IHRoaXMudXJsLnBvcnQsXG4gICAgICBiYXNlOiB0aGlzLmJhc2VQYXRoLFxuICAgICAgdGltZW91dDogdGhpcy53ZGFDb25uZWN0aW9uVGltZW91dCxcbiAgICAgIGtlZXBBbGl2ZTogdHJ1ZSxcbiAgICB9O1xuXG4gICAgdGhpcy5qd3Byb3h5ID0gbmV3IEpXUHJveHkocHJveHlPcHRzKTtcbiAgICB0aGlzLmp3cHJveHkuc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuICAgIHRoaXMucHJveHlSZXFSZXMgPSB0aGlzLmp3cHJveHkucHJveHlSZXFSZXMuYmluZCh0aGlzLmp3cHJveHkpO1xuXG4gICAgdGhpcy5ub1Nlc3Npb25Qcm94eSA9IG5ldyBOb1Nlc3Npb25Qcm94eShwcm94eU9wdHMpO1xuICB9XG5cbiAgYXN5bmMgcXVpdCAoKSB7XG4gICAgbG9nLmluZm8oJ1NodXR0aW5nIGRvd24gc3ViLXByb2Nlc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy54Y29kZWJ1aWxkLnF1aXQoKTtcbiAgICBhd2FpdCB0aGlzLnhjb2RlYnVpbGQucmVzZXQoKTtcblxuICAgIGlmICh0aGlzLmp3cHJveHkpIHtcbiAgICAgIHRoaXMuandwcm94eS5zZXNzaW9uSWQgPSBudWxsO1xuICAgIH1cblxuICAgIHRoaXMuc3RhcnRlZCA9IGZhbHNlO1xuXG4gICAgaWYgKCF0aGlzLmFyZ3Mud2ViRHJpdmVyQWdlbnRVcmwpIHtcbiAgICAgIC8vIGlmIHdlIHBvcHVsYXRlZCB0aGUgdXJsIG91cnNlbHZlcyAoZHVyaW5nIGBzZXR1cENhY2hpbmdgIGNhbGwsIGZvciBpbnN0YW5jZSlcbiAgICAgIC8vIHRoZW4gY2xlYW4gdGhhdCB1cC4gSWYgdGhlIHVybCB3YXMgc3VwcGxpZWQsIHdlIHdhbnQgdG8ga2VlcCBpdFxuICAgICAgdGhpcy53ZWJEcml2ZXJBZ2VudFVybCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZ2V0IHVybCAoKSB7XG4gICAgaWYgKCF0aGlzLl91cmwpIHtcbiAgICAgIGlmICh0aGlzLndlYkRyaXZlckFnZW50VXJsKSB7XG4gICAgICAgIHRoaXMuX3VybCA9IHVybC5wYXJzZSh0aGlzLndlYkRyaXZlckFnZW50VXJsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBvcnQgPSB0aGlzLndkYUxvY2FsUG9ydCB8fCBXREFfQUdFTlRfUE9SVDtcbiAgICAgICAgY29uc3Qge3Byb3RvY29sLCBob3N0bmFtZX0gPSB1cmwucGFyc2UodGhpcy53ZGFCYXNlVXJsIHx8IFdEQV9CQVNFX1VSTCk7XG4gICAgICAgIHRoaXMuX3VybCA9IHVybC5wYXJzZShgJHtwcm90b2NvbH0vLyR7aG9zdG5hbWV9OiR7cG9ydH1gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX3VybDtcbiAgfVxuXG4gIHNldCB1cmwgKF91cmwpIHtcbiAgICB0aGlzLl91cmwgPSB1cmwucGFyc2UoX3VybCk7XG4gIH1cblxuICBnZXQgZnVsbHlTdGFydGVkICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGFydGVkO1xuICB9XG5cbiAgc2V0IGZ1bGx5U3RhcnRlZCAoc3RhcnRlZCA9IGZhbHNlKSB7XG4gICAgdGhpcy5zdGFydGVkID0gc3RhcnRlZDtcbiAgfVxuXG4gIGFzeW5jIHJldHJpZXZlRGVyaXZlZERhdGFQYXRoICgpIHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy54Y29kZWJ1aWxkLnJldHJpZXZlRGVyaXZlZERhdGFQYXRoKCk7XG4gIH1cblxuICAvKipcbiAgICogUmV1c2UgcnVubmluZyBXREEgaWYgaXQgaGFzIHRoZSBzYW1lIGJ1bmRsZSBpZCB3aXRoIHVwZGF0ZWRXREFCdW5kbGVJZC5cbiAgICogT3IgcmV1c2UgaXQgaWYgaXQgaGFzIHRoZSBkZWZhdWx0IGlkIHdpdGhvdXQgdXBkYXRlZFdEQUJ1bmRsZUlkLlxuICAgKiBVbmluc3RhbGwgaXQgaWYgdGhlIG1ldGhvZCBmYWNlcyBhbiBleGNlcHRpb24gZm9yIHRoZSBhYm92ZSBzaXR1YXRpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSB1cGRhdGVkV0RBQnVuZGxlSWQgQnVuZGxlSWQgeW91J2QgbGlrZSB0byB1c2VcbiAgICovXG4gIGFzeW5jIHNldHVwQ2FjaGluZyAoKSB7XG4gICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgdGhpcy5nZXRTdGF0dXMoKTtcbiAgICBpZiAoIXN0YXR1cyB8fCAhc3RhdHVzLmJ1aWxkKSB7XG4gICAgICBsb2cuZGVidWcoJ1dEQSBpcyBjdXJyZW50bHkgbm90IHJ1bm5pbmcuIFRoZXJlIGlzIG5vdGhpbmcgdG8gY2FjaGUnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB7XG4gICAgICBwcm9kdWN0QnVuZGxlSWRlbnRpZmllcixcbiAgICAgIHVwZ3JhZGVkQXQsXG4gICAgfSA9IHN0YXR1cy5idWlsZDtcbiAgICAvLyBmb3IgcmVhbCBkZXZpY2VcbiAgICBpZiAodXRpbC5oYXNWYWx1ZShwcm9kdWN0QnVuZGxlSWRlbnRpZmllcikgJiYgdXRpbC5oYXNWYWx1ZSh0aGlzLnVwZGF0ZWRXREFCdW5kbGVJZCkgJiYgdGhpcy51cGRhdGVkV0RBQnVuZGxlSWQgIT09IHByb2R1Y3RCdW5kbGVJZGVudGlmaWVyKSB7XG4gICAgICBsb2cuaW5mbyhgV2lsbCB1bmluc3RhbGwgcnVubmluZyBXREEgc2luY2UgaXQgaGFzIGRpZmZlcmVudCBidW5kbGUgaWQuIFRoZSBhY3R1YWwgdmFsdWUgaXMgJyR7cHJvZHVjdEJ1bmRsZUlkZW50aWZpZXJ9Jy5gKTtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLnVuaW5zdGFsbCgpO1xuICAgIH1cbiAgICAvLyBmb3Igc2ltdWxhdG9yXG4gICAgaWYgKHV0aWwuaGFzVmFsdWUocHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIpICYmICF1dGlsLmhhc1ZhbHVlKHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkKSAmJiBXREFfUlVOTkVSX0JVTkRMRV9JRCAhPT0gcHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIpIHtcbiAgICAgIGxvZy5pbmZvKGBXaWxsIHVuaW5zdGFsbCBydW5uaW5nIFdEQSBzaW5jZSBpdHMgYnVuZGxlIGlkIGlzIG5vdCBlcXVhbCB0byB0aGUgZGVmYXVsdCB2YWx1ZSAke1dEQV9SVU5ORVJfQlVORExFX0lEfWApO1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMudW5pbnN0YWxsKCk7XG4gICAgfVxuXG4gICAgY29uc3QgYWN0dWFsVXBncmFkZVRpbWVzdGFtcCA9IGF3YWl0IGdldFdEQVVwZ3JhZGVUaW1lc3RhbXAoKTtcbiAgICBsb2cuZGVidWcoYFVwZ3JhZGUgdGltZXN0YW1wIG9mIHRoZSBjdXJyZW50bHkgYnVuZGxlZCBXREE6ICR7YWN0dWFsVXBncmFkZVRpbWVzdGFtcH1gKTtcbiAgICBsb2cuZGVidWcoYFVwZ3JhZGUgdGltZXN0YW1wIG9mIHRoZSBXREEgb24gdGhlIGRldmljZTogJHt1cGdyYWRlZEF0fWApO1xuICAgIGlmIChhY3R1YWxVcGdyYWRlVGltZXN0YW1wICYmIHVwZ3JhZGVkQXQgJiYgXy50b0xvd2VyKGAke2FjdHVhbFVwZ3JhZGVUaW1lc3RhbXB9YCkgIT09IF8udG9Mb3dlcihgJHt1cGdyYWRlZEF0fWApKSB7XG4gICAgICBsb2cuaW5mbygnV2lsbCB1bmluc3RhbGwgcnVubmluZyBXREEgc2luY2UgaXQgaGFzIGRpZmZlcmVudCB2ZXJzaW9uIGluIGNvbXBhcmlzb24gdG8gdGhlIG9uZSAnICtcbiAgICAgICAgYHdoaWNoIGlzIGJ1bmRsZWQgd2l0aCBhcHBpdW0teGN1aXRlc3QtZHJpdmVyIG1vZHVsZSAoJHthY3R1YWxVcGdyYWRlVGltZXN0YW1wfSAhPSAke3VwZ3JhZGVkQXR9KWApO1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMudW5pbnN0YWxsKCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVzc2FnZSA9IHV0aWwuaGFzVmFsdWUocHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIpXG4gICAgICA/IGBXaWxsIHJldXNlIHByZXZpb3VzbHkgY2FjaGVkIFdEQSBpbnN0YW5jZSBhdCAnJHt0aGlzLnVybC5ocmVmfScgd2l0aCAnJHtwcm9kdWN0QnVuZGxlSWRlbnRpZmllcn0nYFxuICAgICAgOiBgV2lsbCByZXVzZSBwcmV2aW91c2x5IGNhY2hlZCBXREEgaW5zdGFuY2UgYXQgJyR7dGhpcy51cmwuaHJlZn0nYDtcbiAgICBsb2cuaW5mbyhgJHttZXNzYWdlfS4gU2V0IHRoZSB3ZGFMb2NhbFBvcnQgY2FwYWJpbGl0eSB0byBhIHZhbHVlIGRpZmZlcmVudCBmcm9tICR7dGhpcy51cmwucG9ydH0gaWYgdGhpcyBpcyBhbiB1bmRlc2lyZWQgYmVoYXZpb3IuYCk7XG4gICAgdGhpcy53ZWJEcml2ZXJBZ2VudFVybCA9IHRoaXMudXJsLmhyZWY7XG4gIH1cblxuICAvKipcbiAgICogUXVpdCBhbmQgdW5pbnN0YWxsIHJ1bm5pbmcgV0RBLlxuICAgKi9cbiAgYXN5bmMgcXVpdEFuZFVuaW5zdGFsbCAoKSB7XG4gICAgYXdhaXQgdGhpcy5xdWl0KCk7XG4gICAgYXdhaXQgdGhpcy51bmluc3RhbGwoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBXZWJEcml2ZXJBZ2VudDtcbmV4cG9ydCB7IFdlYkRyaXZlckFnZW50IH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBS0EsTUFBTUEsa0JBQWtCLEdBQUcsS0FBSyxJQUFoQztBQUNBLE1BQU1DLGNBQWMsR0FBRyxJQUF2QjtBQUNBLE1BQU1DLGtCQUFrQixHQUFHLDZCQUEzQjtBQUNBLE1BQU1DLHNCQUFzQixHQUFHLElBQUlDLGtCQUFKLEVBQS9COztBQUVBLE1BQU1DLGNBQU4sQ0FBcUI7RUFDbkJDLFdBQVcsQ0FBRUMsWUFBRixFQUFnQkMsSUFBSSxHQUFHLEVBQXZCLEVBQTJCO0lBQ3BDLEtBQUtELFlBQUwsR0FBb0JBLFlBQXBCO0lBRUEsS0FBS0MsSUFBTCxHQUFZQyxlQUFBLENBQUVDLEtBQUYsQ0FBUUYsSUFBUixDQUFaO0lBRUEsS0FBS0csTUFBTCxHQUFjSCxJQUFJLENBQUNHLE1BQW5CO0lBQ0EsS0FBS0MsZUFBTCxHQUF1QkosSUFBSSxDQUFDSSxlQUE1QjtJQUNBLEtBQUtDLFlBQUwsR0FBb0JMLElBQUksQ0FBQ0ssWUFBekI7SUFDQSxLQUFLQyxhQUFMLEdBQXFCTixJQUFJLENBQUNNLGFBQTFCO0lBQ0EsS0FBS0MsSUFBTCxHQUFZUCxJQUFJLENBQUNPLElBQWpCO0lBQ0EsS0FBS0MsWUFBTCxHQUFvQixDQUFDLENBQUNSLElBQUksQ0FBQ1MsVUFBM0I7SUFDQSxLQUFLQyxHQUFMLEdBQVcsQ0FBQ1YsSUFBSSxDQUFDRyxNQUFMLElBQWUsRUFBaEIsRUFBb0JPLEdBQS9CO0lBQ0EsS0FBS0MsYUFBTCxHQUFxQlgsSUFBSSxDQUFDVyxhQUExQjtJ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
