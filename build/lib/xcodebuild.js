"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.XcodeBuild = void 0;

require("source-map-support/register");

var _asyncbox = require("asyncbox");

var _teen_process = require("teen_process");

var _appiumSupport = require("appium-support");

var _logger = _interopRequireDefault(require("./logger"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _utils = require("./utils");

var _lodash = _interopRequireDefault(require("lodash"));

var _path = _interopRequireDefault(require("path"));

var _os = require("os");

var _constants = require("./constants");

const DEFAULT_SIGNING_ID = 'iPhone Developer';
const PREBUILD_DELAY = 0;
const RUNNER_SCHEME_IOS = 'WebDriverAgentRunner';
const LIB_SCHEME_IOS = 'WebDriverAgentLib';
const ERROR_WRITING_ATTACHMENT = 'Error writing attachment data to file';
const ERROR_COPYING_ATTACHMENT = 'Error copying testing attachment';
const IGNORED_ERRORS = [ERROR_WRITING_ATTACHMENT, ERROR_COPYING_ATTACHMENT, 'Failed to remove screenshot at path'];
const RUNNER_SCHEME_TV = 'WebDriverAgentRunner_tvOS';
const LIB_SCHEME_TV = 'WebDriverAgentLib_tvOS';

const xcodeLog = _appiumSupport.logger.getLogger('Xcode');

class XcodeBuild {
  constructor(xcodeVersion, device, args = {}) {
    this.xcodeVersion = xcodeVersion;
    this.device = device;
    this.realDevice = args.realDevice;
    this.agentPath = args.agentPath;
    this.bootstrapPath = args.bootstrapPath;
    this.platformVersion = args.platformVersion;
    this.platformName = args.platformName;
    this.iosSdkVersion = args.iosSdkVersion;
    this.showXcodeLog = args.showXcodeLog;
    this.xcodeConfigFile = args.xcodeConfigFile;
    this.xcodeOrgId = args.xcodeOrgId;
    this.xcodeSigningId = args.xcodeSigningId || DEFAULT_SIGNING_ID;
    this.keychainPath = args.keychainPath;
    this.keychainPassword = args.keychainPassword;
    this.prebuildWDA = args.prebuildWDA;
    this.usePrebuiltWDA = args.usePrebuiltWDA;
    this.useSimpleBuildTest = args.useSimpleBuildTest;
    this.useXctestrunFile = args.useXctestrunFile;
    this.launchTimeout = args.launchTimeout;
    this.wdaRemotePort = args.wdaRemotePort;
    this.updatedWDABundleId = args.updatedWDABundleId;
    this.derivedDataPath = args.derivedDataPath;
    this.mjpegServerPort = args.mjpegServerPort;
    this.prebuildDelay = _lodash.default.isNumber(args.prebuildDelay) ? args.prebuildDelay : PREBUILD_DELAY;
    this.allowProvisioningDeviceRegistration = args.allowProvisioningDeviceRegistration;
    this.resultBundlePath = args.resultBundlePath;
    this.resultBundleVersion = args.resultBundleVersion;
  }

  async init(noSessionProxy) {
    this.noSessionProxy = noSessionProxy;

    if (this.useXctestrunFile) {
      const deviveInfo = {
        isRealDevice: this.realDevice,
        udid: this.device.udid,
        platformVersion: this.platformVersion,
        platformName: this.platformName
      };
      this.xctestrunFilePath = await (0, _utils.setXctestrunFile)(deviveInfo, this.iosSdkVersion, this.bootstrapPath, this.wdaRemotePort);
      return;
    }

    if (this.realDevice) {
      await (0, _utils.resetProjectFile)(this.agentPath);

      if (this.updatedWDABundleId) {
        await (0, _utils.updateProjectFile)(this.agentPath, this.updatedWDABundleId);
      }
    }
  }

  async retrieveDerivedDataPath() {
    if (this.derivedDataPath) {
      return this.derivedDataPath;
    }

    if (this._derivedDataPathPromise) {
      return await this._derivedDataPathPromise;
    }

    this._derivedDataPathPromise = (async () => {
      let stdout;

      try {
        ({
          stdout
        } = await (0, _teen_process.exec)('xcodebuild', ['-project', this.agentPath, '-showBuildSettings']));
      } catch (err) {
        _logger.default.warn(`Cannot retrieve WDA build settings. Original error: ${err.message}`);

        return;
      }

      const pattern = /^\s*BUILD_DIR\s+=\s+(\/.*)/m;
      const match = pattern.exec(stdout);

      if (!match) {
        _logger.default.warn(`Cannot parse WDA build dir from ${_lodash.default.truncate(stdout, {
          length: 300
        })}`);

        return;
      }

      _logger.default.debug(`Parsed BUILD_DIR configuration value: '${match[1]}'`);

      this.derivedDataPath = _path.default.dirname(_path.default.dirname(_path.default.normalize(match[1])));

      _logger.default.debug(`Got derived data root: '${this.derivedDataPath}'`);

      return this.derivedDataPath;
    })();

    return await this._derivedDataPathPromise;
  }

  async reset() {
    if (this.realDevice && this.updatedWDABundleId) {
      await (0, _utils.resetProjectFile)(this.agentPath);
    }
  }

  async prebuild() {
    _logger.default.debug('Pre-building WDA before launching test');

    this.usePrebuiltWDA = true;
    await this.start(true);
    this.xcodebuild = null;
    await _bluebird.default.delay(this.prebuildDelay);
  }

  async cleanProject() {
    const tmpIsTvOS = (0, _utils.isTvOS)(this.platformName);
    const libScheme = tmpIsTvOS ? LIB_SCHEME_TV : LIB_SCHEME_IOS;
    const runnerScheme = tmpIsTvOS ? RUNNER_SCHEME_TV : RUNNER_SCHEME_IOS;

    for (const scheme of [libScheme, runnerScheme]) {
      _logger.default.debug(`Cleaning the project scheme '${scheme}' to make sure there are no leftovers from previous installs`);

      await (0, _teen_process.exec)('xcodebuild', ['clean', '-project', this.agentPath, '-scheme', scheme]);
    }
  }

  getCommand(buildOnly = false) {
    let cmd = 'xcodebuild';
    let args;
    const [buildCmd, testCmd] = this.useSimpleBuildTest ? ['build', 'test'] : ['build-for-testing', 'test-without-building'];

    if (buildOnly) {
      args = [buildCmd];
    } else if (this.usePrebuiltWDA || this.useXctestrunFile) {
      args = [testCmd];
    } else {
      args = [buildCmd, testCmd];
    }

    if (this.allowProvisioningDeviceRegistration) {
      args.push('-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration');
    }

    if (this.resultBundlePath) {
      args.push('-resultBundlePath', this.resultBundlePath);
    }

    if (this.resultBundleVersion) {
      args.push('-resultBundleVersion', this.resultBundleVersion);
    }

    if (this.useXctestrunFile) {
      args.push('-xctestrun', this.xctestrunFilePath);
    } else {
      const runnerScheme = (0, _utils.isTvOS)(this.platformName) ? RUNNER_SCHEME_TV : RUNNER_SCHEME_IOS;
      args.push('-project', this.agentPath, '-scheme', runnerScheme);

      if (this.derivedDataPath) {
        args.push('-derivedDataPath', this.derivedDataPath);
      }
    }

    args.push('-destination', `id=${this.device.udid}`);
    const versionMatch = new RegExp(/^(\d+)\.(\d+)/).exec(this.platformVersion);

    if (versionMatch) {
      args.push(`IPHONEOS_DEPLOYMENT_TARGET=${versionMatch[1]}.${versionMatch[2]}`);
    } else {
      _logger.default.warn(`Cannot parse major and minor version numbers from platformVersion "${this.platformVersion}". ` + 'Will build for the default platform instead');
    }

    if (this.realDevice && this.xcodeConfigFile) {
      _logger.default.debug(`Using Xcode configuration file: '${this.xcodeConfigFile}'`);

      args.push('-xcconfig', this.xcodeConfigFile);
    }

    if (!process.env.APPIUM_XCUITEST_TREAT_WARNINGS_AS_ERRORS) {
      args.push('GCC_TREAT_WARNINGS_AS_ERRORS=0');
    }

    args.push('COMPILER_INDEX_STORE_ENABLE=NO');
    return {
      cmd,
      args
    };
  }

  async createSubProcess(buildOnly = false) {
    if (!this.useXctestrunFile && this.realDevice) {
      if (this.keychainPath && this.keychainPassword) {
        await (0, _utils.setRealDeviceSecurity)(this.keychainPath, this.keychainPassword);
      }

      if (this.xcodeOrgId && this.xcodeSigningId && !this.xcodeConfigFile) {
        this.xcodeConfigFile = await (0, _utils.generateXcodeConfigFile)(this.xcodeOrgId, this.xcodeSigningId);
      }
    }

    const {
      cmd,
      args
    } = this.getCommand(buildOnly);

    _logger.default.debug(`Beginning ${buildOnly ? 'build' : 'test'} with command '${cmd} ${args.join(' ')}' ` + `in directory '${this.bootstrapPath}'`);

    const env = Object.assign({}, process.env, {
      USE_PORT: this.wdaRemotePort,
      WDA_PRODUCT_BUNDLE_IDENTIFIER: this.updatedWDABundleId || _constants.WDA_RUNNER_BUNDLE_ID
    });

    if (this.mjpegServerPort) {
      env.MJPEG_SERVER_PORT = this.mjpegServerPort;
    }

    const upgradeTimestamp = await (0, _utils.getWDAUpgradeTimestamp)(this.bootstrapPath);

    if (upgradeTimestamp) {
      env.UPGRADE_TIMESTAMP = upgradeTimestamp;
    }

    const xcodebuild = new _teen_process.SubProcess(cmd, args, {
      cwd: this.bootstrapPath,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let logXcodeOutput = !!this.showXcodeLog;
    const logMsg = _lodash.default.isBoolean(this.showXcodeLog) ? `Output from xcodebuild ${this.showXcodeLog ? 'will' : 'will not'} be logged` : 'Output from xcodebuild will only be logged if any errors are present there';

    _logger.default.debug(`${logMsg}. To change this, use 'showXcodeLog' desired capability`);

    xcodebuild.on('output', (stdout, stderr) => {
      let out = stdout || stderr;

      if (out.includes('Writing diagnostic log for test session to')) {
        xcodebuild.logLocation = _lodash.default.first(_lodash.default.remove(out.trim().split('\n'), v => v.startsWith(_path.default.sep)));

        _logger.default.debug(`Log file for xcodebuild test: ${xcodebuild.logLocation}`);
      }

      const ignoreError = IGNORED_ERRORS.some(x => out.includes(x));

      if (this.showXcodeLog !== false && out.includes('Error Domain=') && !ignoreError) {
        logXcodeOutput = true;
        xcodebuild._wda_error_occurred = true;
      }

      if (logXcodeOutput && !ignoreError) {
        for (const line of out.split(_os.EOL)) {
          xcodeLog.error(line);

          if (line) {
            xcodebuild._wda_error_message += `${_os.EOL}${line}`;
          }
        }
      }
    });
    return xcodebuild;
  }

  async start(buildOnly = false) {
    this.xcodebuild = await this.createSubProcess(buildOnly);
    this.xcodebuild._wda_error_message = '';
    return await new _bluebird.default((resolve, reject) => {
      this.xcodebuild.on('exit', async (code, signal) => {
        _logger.default.error(`xcodebuild exited with code '${code}' and signal '${signal}'`);

        if (this.showXcodeLog && this.xcodebuild.logLocation) {
          xcodeLog.error(`Contents of xcodebuild log file '${this.xcodebuild.logLocation}':`);

          try {
            let data = await _appiumSupport.fs.readFile(this.xcodebuild.logLocation, 'utf8');

            for (let line of data.split('\n')) {
              xcodeLog.error(line);
            }
          } catch (err) {
            _logger.default.error(`Unable to access xcodebuild log file: '${err.message}'`);
          }
        }

        this.xcodebuild.processExited = true;

        if (this.xcodebuild._wda_error_occurred || !signal && code !== 0) {
          return reject(new Error(`xcodebuild failed with code ${code}${_os.EOL}` + `xcodebuild error message:${_os.EOL}${this.xcodebuild._wda_error_message}`));
        }

        if (buildOnly) {
          return resolve();
        }
      });
      return (async () => {
        try {
          const timer = new _appiumSupport.timing.Timer().start();
          await this.xcodebuild.start(true);

          if (!buildOnly) {
            let status = await this.waitForStart(timer);
            resolve(status);
          }
        } catch (err) {
          let msg = `Unable to start WebDriverAgent: ${err}`;

          _logger.default.error(msg);

          reject(new Error(msg));
        }
      })();
    });
  }

  async waitForStart(timer) {
    _logger.default.debug(`Waiting up to ${this.launchTimeout}ms for WebDriverAgent to start`);

    let currentStatus = null;

    try {
      let retries = parseInt(this.launchTimeout / 500, 10);
      await (0, _asyncbox.retryInterval)(retries, 1000, async () => {
        if (this.xcodebuild.processExited) {
          return;
        }

        const proxyTimeout = this.noSessionProxy.timeout;
        this.noSessionProxy.timeout = 1000;

        try {
          currentStatus = await this.noSessionProxy.command('/status', 'GET');

          if (currentStatus && currentStatus.ios && currentStatus.ios.ip) {
            this.agentUrl = currentStatus.ios.ip;
          }

          _logger.default.debug(`WebDriverAgent information:`);

          _logger.default.debug(JSON.stringify(currentStatus, null, 2));
        } catch (err) {
          throw new Error(`Unable to connect to running WebDriverAgent: ${err.message}`);
        } finally {
          this.noSessionProxy.timeout = proxyTimeout;
        }
      });

      if (this.xcodebuild.processExited) {
        return currentStatus;
      }

      _logger.default.debug(`WebDriverAgent successfully started after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    } catch (err) {
      _logger.default.debug(err.message);

      _logger.default.warn(`Getting status of WebDriverAgent on device timed out. Continuing`);
    }

    return currentStatus;
  }

  async quit() {
    await (0, _utils.killProcess)('xcodebuild', this.xcodebuild);
  }

}

exports.XcodeBuild = XcodeBuild;
var _default = XcodeBuild;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliL3hjb2RlYnVpbGQuanMiLCJuYW1lcyI6WyJERUZBVUxUX1NJR05JTkdfSUQiLCJQUkVCVUlMRF9ERUxBWSIsIlJVTk5FUl9TQ0hFTUVfSU9TIiwiTElCX1NDSEVNRV9JT1MiLCJFUlJPUl9XUklUSU5HX0FUVEFDSE1FTlQiLCJFUlJPUl9DT1BZSU5HX0FUVEFDSE1FTlQiLCJJR05PUkVEX0VSUk9SUyIsIlJVTk5FUl9TQ0hFTUVfVFYiLCJMSUJfU0NIRU1FX1RWIiwieGNvZGVMb2ciLCJsb2dnZXIiLCJnZXRMb2dnZXIiLCJYY29kZUJ1aWxkIiwiY29uc3RydWN0b3IiLCJ4Y29kZVZlcnNpb24iLCJkZXZpY2UiLCJhcmdzIiwicmVhbERldmljZSIsImFnZW50UGF0aCIsImJvb3RzdHJhcFBhdGgiLCJwbGF0Zm9ybVZlcnNpb24iLCJwbGF0Zm9ybU5hbWUiLCJpb3NTZGtWZXJzaW9uIiwic2hvd1hjb2RlTG9nIiwieGNvZGVDb25maWdGaWxlIiwieGNvZGVPcmdJZCIsInhjb2RlU2lnbmluZ0lkIiwia2V5Y2hhaW5QYXRoIiwia2V5Y2hhaW5QYXNzd29yZCIsInByZWJ1aWxkV0RBIiwidXNlUHJlYnVpbHRXREEiLCJ1c2VTaW1wbGVCdWlsZFRlc3QiLCJ1c2VYY3Rlc3RydW5GaWxlIiwibGF1bmNoVGltZW91dCIsIndkYVJlbW90ZVBvcnQiLCJ1cGRhdGVkV0RBQnVuZGxlSWQiLCJkZXJpdmVkRGF0YVBhdGgiLCJtanBlZ1NlcnZlclBvcnQiLCJwcmVidWlsZERlbGF5IiwiXyIsImlzTnVtYmVyIiwiYWxsb3dQcm92aXNpb25pbmdEZXZpY2VSZWdpc3RyYXRpb24iLCJyZXN1bHRCdW5kbGVQYXRoIiwicmVzdWx0QnVuZGxlVmVyc2lvbiIsImluaXQiLCJub1Nlc3Npb25Qcm94eSIsImRldml2ZUluZm8iLCJpc1JlYWxEZXZpY2UiLCJ1ZGlkIiwieGN0ZXN0cnVuRmlsZVBhdGgiLCJzZXRYY3Rlc3RydW5GaWxlIiwicmVzZXRQcm9qZWN0RmlsZSIsInVwZGF0ZVByb2plY3RGaWxlIiwicmV0cmlldmVEZXJpdmVkRGF0YVBhdGgiLCJfZGVyaXZlZERhdGFQYXRoUHJvbWlzZSIsInN0ZG91dCIsImV4ZWMiLCJlcnIiLCJsb2ciLCJ3YXJuIiwibWVzc2FnZSIsInBhdHRlcm4iLCJtYXRjaCIsInRydW5jYXRlIiwibGVuZ3RoIiwiZGVidWciLCJwYXRoIiwiZGlybmFtZSIsIm5vcm1hbGl6ZSIsInJlc2V0IiwicHJlYnVpbGQiLCJzdGFydCIsInhjb2RlYnVpbGQiLCJCIiwiZGVsYXkiLCJjbGVhblByb2plY3QiLCJ0bXBJc1R2T1MiLCJpc1R2T1MiLCJsaWJTY2hlbWUiLCJydW5uZXJTY2hlbWUiLCJzY2hlbWUiLCJnZXRDb21tYW5kIiwiYnVpbGRPbmx5IiwiY21kIiwiYnVpbGRDbWQiLCJ0ZXN0Q21kIiwicHVzaCIsInZlcnNpb25NYXRjaCIsIlJlZ0V4cCIsInByb2Nlc3MiLCJlbnYiLCJBUFBJVU1fWENVSVRFU1RfVFJFQVRfV0FSTklOR1NfQVNfRVJST1JTIiwiY3JlYXRlU3ViUHJvY2VzcyIsInNldFJlYWxEZXZpY2VTZWN1cml0eSIsImdlbmVyYXRlWGNvZGVDb25maWdGaWxlIiwiam9pbiIsIk9iamVjdCIsImFzc2lnbiIsIlVTRV9QT1JUIiwiV0RBX1BST0RVQ1RfQlVORExFX0lERU5USUZJRVIiLCJXREFfUlVOTkVSX0JVTkRMRV9JRCIsIk1KUEVHX1NFUlZFUl9QT1JUIiwidXBncmFkZVRpbWVzdGFtcCIsImdldFdEQVVwZ3JhZGVUaW1lc3RhbXAiLCJVUEdSQURFX1RJTUVTVEFNUCIsIlN1YlByb2Nlc3MiLCJjd2QiLCJkZXRhY2hlZCIsInN0ZGlvIiwibG9nWGNvZGVPdXRwdXQiLCJsb2dNc2ciLCJpc0Jvb2xlYW4iLCJvbiIsInN0ZGVyciIsIm91dCIsImluY2x1ZGVzIiwibG9nTG9jYXRpb24iLCJmaXJzdCIsInJlbW92ZSIsInRyaW0iLCJzcGxpdCIsInYiLCJzdGFydHNXaXRoIiwic2VwIiwiaWdub3JlRXJyb3IiLCJzb21lIiwieCIsIl93ZGFfZXJyb3Jfb2NjdXJyZWQiLCJsaW5lIiwiRU9MIiwiZXJyb3IiLCJfd2RhX2Vycm9yX21lc3NhZ2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiY29kZSIsInNpZ25hbCIsImRhdGEiLCJmcyIsInJlYWRGaWxlIiwicHJvY2Vzc0V4aXRlZCIsIkVycm9yIiwidGltZXIiLCJ0aW1pbmciLCJUaW1lciIsInN0YXR1cyIsIndhaXRGb3JTdGFydCIsIm1zZyIsImN1cnJlbnRTdGF0dXMiLCJyZXRyaWVzIiwicGFyc2VJbnQiLCJyZXRyeUludGVydmFsIiwicHJveHlUaW1lb3V0IiwidGltZW91dCIsImNvbW1hbmQiLCJpb3MiLCJpcCIsImFnZW50VXJsIiwiSlNPTiIsInN0cmluZ2lmeSIsImdldER1cmF0aW9uIiwiYXNNaWxsaVNlY29uZHMiLCJ0b0ZpeGVkIiwicXVpdCIsImtpbGxQcm9jZXNzIl0sInNvdXJjZVJvb3QiOiIuLi8uLiIsInNvdXJjZXMiOlsibGliL3hjb2RlYnVpbGQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmV0cnlJbnRlcnZhbCB9IGZyb20gJ2FzeW5jYm94JztcbmltcG9ydCB7IFN1YlByb2Nlc3MsIGV4ZWMgfSBmcm9tICd0ZWVuX3Byb2Nlc3MnO1xuaW1wb3J0IHsgZnMsIGxvZ2dlciwgdGltaW5nIH0gZnJvbSAnYXBwaXVtLXN1cHBvcnQnO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQiBmcm9tICdibHVlYmlyZCc7XG5pbXBvcnQge1xuICBzZXRSZWFsRGV2aWNlU2VjdXJpdHksIGdlbmVyYXRlWGNvZGVDb25maWdGaWxlLCBzZXRYY3Rlc3RydW5GaWxlLFxuICB1cGRhdGVQcm9qZWN0RmlsZSwgcmVzZXRQcm9qZWN0RmlsZSwga2lsbFByb2Nlc3MsXG4gIGdldFdEQVVwZ3JhZGVUaW1lc3RhbXAsIGlzVHZPUyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgV0RBX1JVTk5FUl9CVU5ETEVfSUQgfSBmcm9tICcuL2NvbnN0YW50cyc7XG5cblxuY29uc3QgREVGQVVMVF9TSUdOSU5HX0lEID0gJ2lQaG9uZSBEZXZlbG9wZXInO1xuY29uc3QgUFJFQlVJTERfREVMQVkgPSAwO1xuY29uc3QgUlVOTkVSX1NDSEVNRV9JT1MgPSAnV2ViRHJpdmVyQWdlbnRSdW5uZXInO1xuY29uc3QgTElCX1NDSEVNRV9JT1MgPSAnV2ViRHJpdmVyQWdlbnRMaWInO1xuXG5jb25zdCBFUlJPUl9XUklUSU5HX0FUVEFDSE1FTlQgPSAnRXJyb3Igd3JpdGluZyBhdHRhY2htZW50IGRhdGEgdG8gZmlsZSc7XG5jb25zdCBFUlJPUl9DT1BZSU5HX0FUVEFDSE1FTlQgPSAnRXJyb3IgY29weWluZyB0ZXN0aW5nIGF0dGFjaG1lbnQnO1xuY29uc3QgSUdOT1JFRF9FUlJPUlMgPSBbXG4gIEVSUk9SX1dSSVRJTkdfQVRUQUNITUVOVCxcbiAgRVJST1JfQ09QWUlOR19BVFRBQ0hNRU5ULFxuICAnRmFpbGVkIHRvIHJlbW92ZSBzY3JlZW5zaG90IGF0IHBhdGgnLFxuXTtcblxuY29uc3QgUlVOTkVSX1NDSEVNRV9UViA9ICdXZWJEcml2ZXJBZ2VudFJ1bm5lcl90dk9TJztcbmNvbnN0IExJQl9TQ0hFTUVfVFYgPSAnV2ViRHJpdmVyQWdlbnRMaWJfdHZPUyc7XG5cbmNvbnN0IHhjb2RlTG9nID0gbG9nZ2VyLmdldExvZ2dlcignWGNvZGUnKTtcblxuXG5jbGFzcyBYY29kZUJ1aWxkIHtcbiAgY29uc3RydWN0b3IgKHhjb2RlVmVyc2lvbiwgZGV2aWNlLCBhcmdzID0ge30pIHtcbiAgICB0aGlzLnhjb2RlVmVyc2lvbiA9IHhjb2RlVmVyc2lvbjtcblxuICAgIHRoaXMuZGV2aWNlID0gZGV2aWNlO1xuXG4gICAgdGhpcy5yZWFsRGV2aWNlID0gYXJncy5yZWFsRGV2aWNlO1xuXG4gICAgdGhpcy5hZ2VudFBhdGggPSBhcmdzLmFnZW50UGF0aDtcbiAgICB0aGlzLmJvb3RzdHJhcFBhdGggPSBhcmdzLmJvb3RzdHJhcFBhdGg7XG5cbiAgICB0aGlzLnBsYXRmb3JtVmVyc2lvbiA9IGFyZ3MucGxhdGZvcm1WZXJzaW9uO1xuICAgIHRoaXMucGxhdGZvcm1OYW1lID0gYXJncy5wbGF0Zm9ybU5hbWU7XG4gICAgdGhpcy5pb3NTZGtWZXJzaW9uID0gYXJncy5pb3NTZGtWZXJzaW9uO1xuXG4gICAgdGhpcy5zaG93WGNvZGVMb2cgPSBhcmdzLnNob3dYY29kZUxvZztcblxuICAgIHRoaXMueGNvZGVDb25maWdGaWxlID0gYXJncy54Y29kZUNvbmZpZ0ZpbGU7XG4gICAgdGhpcy54Y29kZU9yZ0lkID0gYXJncy54Y29kZU9yZ0lkO1xuICAgIHRoaXMueGNvZGVTaWduaW5nSWQgPSBhcmdzLnhjb2RlU2lnbmluZ0lkIHx8IERFRkFVTFRfU0lHTklOR19JRDtcbiAgICB0aGlzLmtleWNoYWluUGF0aCA9IGFyZ3Mua2V5Y2hhaW5QYXRoO1xuICAgIHRoaXMua2V5Y2hhaW5QYXNzd29yZCA9IGFyZ3Mua2V5Y2hhaW5QYXNzd29yZDtcblxuICAgIHRoaXMucHJlYnVpbGRXREEgPSBhcmdzLnByZWJ1aWxkV0RBO1xuICAgIHRoaXMudXNlUHJlYnVpbHRXREEgPSBhcmdzLnVzZVByZWJ1aWx0V0RBO1xuICAgIHRoaXMudXNlU2ltcGxlQnVpbGRUZXN0ID0gYXJncy51c2VTaW1wbGVCdWlsZFRlc3Q7XG5cbiAgICB0aGlzLnVzZVhjdGVzdHJ1bkZpbGUgPSBhcmdzLnVzZVhjdGVzdHJ1bkZpbGU7XG5cbiAgICB0aGlzLmxhdW5jaFRpbWVvdXQgPSBhcmdzLmxhdW5jaFRpbWVvdXQ7XG5cbiAgICB0aGlzLndkYVJlbW90ZVBvcnQgPSBhcmdzLndkYVJlbW90ZVBvcnQ7XG5cbiAgICB0aGlzLnVwZGF0ZWRXREFCdW5kbGVJZCA9IGFyZ3MudXBkYXRlZFdEQUJ1bmRsZUlkO1xuICAgIHRoaXMuZGVyaXZlZERhdGFQYXRoID0gYXJncy5kZXJpdmVkRGF0YVBhdGg7XG5cbiAgICB0aGlzLm1qcGVnU2VydmVyUG9ydCA9IGFyZ3MubWpwZWdTZXJ2ZXJQb3J0O1xuXG4gICAgdGhpcy5wcmVidWlsZERlbGF5ID0gXy5pc051bWJlcihhcmdzLnByZWJ1aWxkRGVsYXkpID8gYXJncy5wcmVidWlsZERlbGF5IDogUFJFQlVJTERfREVMQVk7XG5cbiAgICB0aGlzLmFsbG93UHJvdmlzaW9uaW5nRGV2aWNlUmVnaXN0cmF0aW9uID0gYXJncy5hbGxvd1Byb3Zpc2lvbmluZ0RldmljZVJlZ2lzdHJhdGlvbjtcblxuICAgIHRoaXMucmVzdWx0QnVuZGxlUGF0aCA9IGFyZ3MucmVzdWx0QnVuZGxlUGF0aDtcbiAgICB0aGlzLnJlc3VsdEJ1bmRsZVZlcnNpb24gPSBhcmdzLnJlc3VsdEJ1bmRsZVZlcnNpb247XG4gIH1cblxuICBhc3luYyBpbml0IChub1Nlc3Npb25Qcm94eSkge1xuICAgIHRoaXMubm9TZXNzaW9uUHJveHkgPSBub1Nlc3Npb25Qcm94eTtcblxuICAgIGlmICh0aGlzLnVzZVhjdGVzdHJ1bkZpbGUpIHtcbiAgICAgIGNvbnN0IGRldml2ZUluZm8gPSB7XG4gICAgICAgIGlzUmVhbERldmljZTogdGhpcy5yZWFsRGV2aWNlLFxuICAgICAgICB1ZGlkOiB0aGlzLmRldmljZS51ZGlkLFxuICAgICAgICBwbGF0Zm9ybVZlcnNpb246IHRoaXMucGxhdGZvcm1WZXJzaW9uLFxuICAgICAgICBwbGF0Zm9ybU5hbWU6IHRoaXMucGxhdGZvcm1OYW1lXG4gICAgICB9O1xuICAgICAgdGhpcy54Y3Rlc3RydW5GaWxlUGF0aCA9IGF3YWl0IHNldFhjdGVzdHJ1bkZpbGUoZGV2aXZlSW5mbywgdGhpcy5pb3NTZGtWZXJzaW9uLCB0aGlzLmJvb3RzdHJhcFBhdGgsIHRoaXMud2RhUmVtb3RlUG9ydCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gaWYgbmVjZXNzYXJ5LCB1cGRhdGUgdGhlIGJ1bmRsZUlkIHRvIHVzZXIncyBzcGVjaWZpY2F0aW9uXG4gICAgaWYgKHRoaXMucmVhbERldmljZSkge1xuICAgICAgLy8gSW4gY2FzZSB0aGUgcHJvamVjdCBzdGlsbCBoYXMgdGhlIHVzZXIgc3BlY2lmaWMgYnVuZGxlIElELCByZXNldCB0aGUgcHJvamVjdCBmaWxlIGZpcnN0LlxuICAgICAgLy8gLSBXZSBkbyB0aGlzIHJlc2V0IGV2ZW4gaWYgdXBkYXRlZFdEQUJ1bmRsZUlkIGlzIG5vdCBzcGVjaWZpZWQsXG4gICAgICAvLyAgIHNpbmNlIHRoZSBwcmV2aW91cyB1cGRhdGVkV0RBQnVuZGxlSWQgdGVzdCBoYXMgZ2VuZXJhdGVkIHRoZSB1c2VyIHNwZWNpZmljIGJ1bmRsZSBJRCBwcm9qZWN0IGZpbGUuXG4gICAgICAvLyAtIFdlIGRvbid0IGNhbGwgcmVzZXRQcm9qZWN0RmlsZSBmb3Igc2ltdWxhdG9yLFxuICAgICAgLy8gICBzaW5jZSBzaW11bGF0b3IgdGVzdCBydW4gd2lsbCB3b3JrIHdpdGggYW55IHVzZXIgc3BlY2lmaWMgYnVuZGxlIElELlxuICAgICAgYXdhaXQgcmVzZXRQcm9qZWN0RmlsZSh0aGlzLmFnZW50UGF0aCk7XG4gICAgICBpZiAodGhpcy51cGRhdGVkV0RBQnVuZGxlSWQpIHtcbiAgICAgICAgYXdhaXQgdXBkYXRlUHJvamVjdEZpbGUodGhpcy5hZ2VudFBhdGgsIHRoaXMudXBkYXRlZFdEQUJ1bmRsZUlkKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyByZXRyaWV2ZURlcml2ZWREYXRhUGF0aCAoKSB7XG4gICAgaWYgKHRoaXMuZGVyaXZlZERhdGFQYXRoKSB7XG4gICAgICByZXR1cm4gdGhpcy5kZXJpdmVkRGF0YVBhdGg7XG4gICAgfVxuXG4gICAgLy8gYXZvaWQgcmFjZSBjb25kaXRpb25zXG4gICAgaWYgKHRoaXMuX2Rlcml2ZWREYXRhUGF0aFByb21pc2UpIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLl9kZXJpdmVkRGF0YVBhdGhQcm9taXNlO1xuICAgIH1cblxuICAgIHRoaXMuX2Rlcml2ZWREYXRhUGF0aFByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgbGV0IHN0ZG91dDtcbiAgICAgIHRyeSB7XG4gICAgICAgICh7c3Rkb3V0fSA9IGF3YWl0IGV4ZWMoJ3hjb2RlYnVpbGQnLCBbJy1wcm9qZWN0JywgdGhpcy5hZ2VudFBhdGgsICctc2hvd0J1aWxkU2V0dGluZ3MnXSkpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZy53YXJuKGBDYW5ub3QgcmV0cmlldmUgV0RBIGJ1aWxkIHNldHRpbmdzLiBPcmlnaW5hbCBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXR0ZXJuID0gL15cXHMqQlVJTERfRElSXFxzKz1cXHMrKFxcLy4qKS9tO1xuICAgICAgY29uc3QgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoc3Rkb3V0KTtcbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgbG9nLndhcm4oYENhbm5vdCBwYXJzZSBXREEgYnVpbGQgZGlyIGZyb20gJHtfLnRydW5jYXRlKHN0ZG91dCwge2xlbmd0aDogMzAwfSl9YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxvZy5kZWJ1ZyhgUGFyc2VkIEJVSUxEX0RJUiBjb25maWd1cmF0aW9uIHZhbHVlOiAnJHttYXRjaFsxXX0nYCk7XG4gICAgICAvLyBEZXJpdmVkIGRhdGEgcm9vdCBpcyB0d28gbGV2ZWxzIGhpZ2hlciBvdmVyIHRoZSBidWlsZCBkaXJcbiAgICAgIHRoaXMuZGVyaXZlZERhdGFQYXRoID0gcGF0aC5kaXJuYW1lKHBhdGguZGlybmFtZShwYXRoLm5vcm1hbGl6ZShtYXRjaFsxXSkpKTtcbiAgICAgIGxvZy5kZWJ1ZyhgR290IGRlcml2ZWQgZGF0YSByb290OiAnJHt0aGlzLmRlcml2ZWREYXRhUGF0aH0nYCk7XG4gICAgICByZXR1cm4gdGhpcy5kZXJpdmVkRGF0YVBhdGg7XG4gICAgfSkoKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5fZGVyaXZlZERhdGFQYXRoUHJvbWlzZTtcbiAgfVxuXG4gIGFzeW5jIHJlc2V0ICgpIHtcbiAgICAvLyBpZiBuZWNlc3NhcnksIHJlc2V0IHRoZSBidW5kbGVJZCB0byBvcmlnaW5hbCB2YWx1ZVxuICAgIGlmICh0aGlzLnJlYWxEZXZpY2UgJiYgdGhpcy51cGRhdGVkV0RBQnVuZGxlSWQpIHtcbiAgICAgIGF3YWl0IHJlc2V0UHJvamVjdEZpbGUodGhpcy5hZ2VudFBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHByZWJ1aWxkICgpIHtcbiAgICAvLyBmaXJzdCBkbyBhIGJ1aWxkIHBoYXNlXG4gICAgbG9nLmRlYnVnKCdQcmUtYnVpbGRpbmcgV0RBIGJlZm9yZSBsYXVuY2hpbmcgdGVzdCcpO1xuICAgIHRoaXMudXNlUHJlYnVpbHRXREEgPSB0cnVlO1xuICAgIGF3YWl0IHRoaXMuc3RhcnQodHJ1ZSk7XG5cbiAgICB0aGlzLnhjb2RlYnVpbGQgPSBudWxsO1xuXG4gICAgLy8gcGF1c2UgYSBtb21lbnRcbiAgICBhd2FpdCBCLmRlbGF5KHRoaXMucHJlYnVpbGREZWxheSk7XG4gIH1cblxuICBhc3luYyBjbGVhblByb2plY3QgKCkge1xuICAgIGNvbnN0IHRtcElzVHZPUyA9IGlzVHZPUyh0aGlzLnBsYXRmb3JtTmFtZSk7XG4gICAgY29uc3QgbGliU2NoZW1lID0gdG1wSXNUdk9TID8gTElCX1NDSEVNRV9UViA6IExJQl9TQ0hFTUVfSU9TO1xuICAgIGNvbnN0IHJ1bm5lclNjaGVtZSA9IHRtcElzVHZPUyA/IFJVTk5FUl9TQ0hFTUVfVFYgOiBSVU5ORVJfU0NIRU1FX0lPUztcblxuICAgIGZvciAoY29uc3Qgc2NoZW1lIG9mIFtsaWJTY2hlbWUsIHJ1bm5lclNjaGVtZV0pIHtcbiAgICAgIGxvZy5kZWJ1ZyhgQ2xlYW5pbmcgdGhlIHByb2plY3Qgc2NoZW1lICcke3NjaGVtZX0nIHRvIG1ha2Ugc3VyZSB0aGVyZSBhcmUgbm8gbGVmdG92ZXJzIGZyb20gcHJldmlvdXMgaW5zdGFsbHNgKTtcbiAgICAgIGF3YWl0IGV4ZWMoJ3hjb2RlYnVpbGQnLCBbXG4gICAgICAgICdjbGVhbicsXG4gICAgICAgICctcHJvamVjdCcsIHRoaXMuYWdlbnRQYXRoLFxuICAgICAgICAnLXNjaGVtZScsIHNjaGVtZSxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuXG4gIGdldENvbW1hbmQgKGJ1aWxkT25seSA9IGZhbHNlKSB7XG4gICAgbGV0IGNtZCA9ICd4Y29kZWJ1aWxkJztcbiAgICBsZXQgYXJncztcblxuICAgIC8vIGZpZ3VyZSBvdXQgdGhlIHRhcmdldHMgZm9yIHhjb2RlYnVpbGRcbiAgICBjb25zdCBbYnVpbGRDbWQsIHRlc3RDbWRdID0gdGhpcy51c2VTaW1wbGVCdWlsZFRlc3QgPyBbJ2J1aWxkJywgJ3Rlc3QnXSA6IFsnYnVpbGQtZm9yLXRlc3RpbmcnLCAndGVzdC13aXRob3V0LWJ1aWxkaW5nJ107XG4gICAgaWYgKGJ1aWxkT25seSkge1xuICAgICAgYXJncyA9IFtidWlsZENtZF07XG4gICAgfSBlbHNlIGlmICh0aGlzLnVzZVByZWJ1aWx0V0RBIHx8IHRoaXMudXNlWGN0ZXN0cnVuRmlsZSkge1xuICAgICAgYXJncyA9IFt0ZXN0Q21kXTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXJncyA9IFtidWlsZENtZCwgdGVzdENtZF07XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuYWxsb3dQcm92aXNpb25pbmdEZXZpY2VSZWdpc3RyYXRpb24pIHtcbiAgICAgIC8vIFRvIC1hbGxvd1Byb3Zpc2lvbmluZ0RldmljZVJlZ2lzdHJhdGlvbiBmbGFnIHRha2VzIGVmZmVjdCwgLWFsbG93UHJvdmlzaW9uaW5nVXBkYXRlcyBuZWVkcyB0byBiZSBwYXNzZWQgYXMgd2VsbC5cbiAgICAgIGFyZ3MucHVzaCgnLWFsbG93UHJvdmlzaW9uaW5nVXBkYXRlcycsICctYWxsb3dQcm92aXNpb25pbmdEZXZpY2VSZWdpc3RyYXRpb24nKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5yZXN1bHRCdW5kbGVQYXRoKSB7XG4gICAgICBhcmdzLnB1c2goJy1yZXN1bHRCdW5kbGVQYXRoJywgdGhpcy5yZXN1bHRCdW5kbGVQYXRoKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5yZXN1bHRCdW5kbGVWZXJzaW9uKSB7XG4gICAgICBhcmdzLnB1c2goJy1yZXN1bHRCdW5kbGVWZXJzaW9uJywgdGhpcy5yZXN1bHRCdW5kbGVWZXJzaW9uKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy51c2VYY3Rlc3RydW5GaWxlKSB7XG4gICAgICBhcmdzLnB1c2goJy14Y3Rlc3RydW4nLCB0aGlzLnhjdGVzdHJ1bkZpbGVQYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcnVubmVyU2NoZW1lID0gaXNUdk9TKHRoaXMucGxhdGZvcm1OYW1lKSA/IFJVTk5FUl9TQ0hFTUVfVFYgOiBSVU5ORVJfU0NIRU1FX0lPUztcbiAgICAgIGFyZ3MucHVzaCgnLXByb2plY3QnLCB0aGlzLmFnZW50UGF0aCwgJy1zY2hlbWUnLCBydW5uZXJTY2hlbWUpO1xuICAgICAgaWYgKHRoaXMuZGVyaXZlZERhdGFQYXRoKSB7XG4gICAgICAgIGFyZ3MucHVzaCgnLWRlcml2ZWREYXRhUGF0aCcsIHRoaXMuZGVyaXZlZERhdGFQYXRoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXJncy5wdXNoKCctZGVzdGluYXRpb24nLCBgaWQ9JHt0aGlzLmRldmljZS51ZGlkfWApO1xuXG4gICAgY29uc3QgdmVyc2lvbk1hdGNoID0gbmV3IFJlZ0V4cCgvXihcXGQrKVxcLihcXGQrKS8pLmV4ZWModGhpcy5wbGF0Zm9ybVZlcnNpb24pO1xuICAgIGlmICh2ZXJzaW9uTWF0Y2gpIHtcbiAgICAgIGFyZ3MucHVzaChgSVBIT05FT1NfREVQTE9ZTUVOVF9UQVJHRVQ9JHt2ZXJzaW9uTWF0Y2hbMV19LiR7dmVyc2lvbk1hdGNoWzJdfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2cud2FybihgQ2Fubm90IHBhcnNlIG1ham9yIGFuZCBtaW5vciB2ZXJzaW9uIG51bWJlcnMgZnJvbSBwbGF0Zm9ybVZlcnNpb24gXCIke3RoaXMucGxhdGZvcm1WZXJzaW9ufVwiLiBgICtcbiAgICAgICAgJ1dpbGwgYnVpbGQgZm9yIHRoZSBkZWZhdWx0IHBsYXRmb3JtIGluc3RlYWQnKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5yZWFsRGV2aWNlICYmIHRoaXMueGNvZGVDb25maWdGaWxlKSB7XG4gICAgICBsb2cuZGVidWcoYFVzaW5nIFhjb2RlIGNvbmZpZ3VyYXRpb24gZmlsZTogJyR7dGhpcy54Y29kZUNvbmZpZ0ZpbGV9J2ApO1xuICAgICAgYXJncy5wdXNoKCcteGNjb25maWcnLCB0aGlzLnhjb2RlQ29uZmlnRmlsZSk7XG4gICAgfVxuXG4gICAgaWYgKCFwcm9jZXNzLmVudi5BUFBJVU1fWENVSVRFU1RfVFJFQVRfV0FSTklOR1NfQVNfRVJST1JTKSB7XG4gICAgICAvLyBUaGlzIHNvbWV0aW1lcyBoZWxwcyB0byBzdXJ2aXZlIFhjb2RlIHVwZGF0ZXNcbiAgICAgIGFyZ3MucHVzaCgnR0NDX1RSRUFUX1dBUk5JTkdTX0FTX0VSUk9SUz0wJyk7XG4gICAgfVxuXG4gICAgLy8gQmVsb3cgb3B0aW9uIHNsaWdodGx5IHJlZHVjZXMgYnVpbGQgdGltZSBpbiBkZWJ1ZyBidWlsZFxuICAgIC8vIHdpdGggcHJldmVudGluZyB0byBnZW5lcmF0ZSBgL0luZGV4L0RhdGFTdG9yZWAgd2hpY2ggaXMgdXNlZCBieSBkZXZlbG9wbWVudFxuICAgIGFyZ3MucHVzaCgnQ09NUElMRVJfSU5ERVhfU1RPUkVfRU5BQkxFPU5PJyk7XG5cbiAgICByZXR1cm4ge2NtZCwgYXJnc307XG4gIH1cblxuICBhc3luYyBjcmVhdGVTdWJQcm9jZXNzIChidWlsZE9ubHkgPSBmYWxzZSkge1xuICAgIGlmICghdGhpcy51c2VYY3Rlc3RydW5GaWxlICYmIHRoaXMucmVhbERldmljZSkge1xuICAgICAgaWYgKHRoaXMua2V5Y2hhaW5QYXRoICYmIHRoaXMua2V5Y2hhaW5QYXNzd29yZCkge1xuICAgICAgICBhd2FpdCBzZXRSZWFsRGV2aWNlU2VjdXJpdHkodGhpcy5rZXljaGFpblBhdGgsIHRoaXMua2V5Y2hhaW5QYXNzd29yZCk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy54Y29kZU9yZ0lkICYmIHRoaXMueGNvZGVTaWduaW5nSWQgJiYgIXRoaXMueGNvZGVDb25maWdGaWxlKSB7XG4gICAgICAgIHRoaXMueGNvZGVDb25maWdGaWxlID0gYXdhaXQgZ2VuZXJhdGVYY29kZUNvbmZpZ0ZpbGUodGhpcy54Y29kZU9yZ0lkLCB0aGlzLnhjb2RlU2lnbmluZ0lkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB7Y21kLCBhcmdzfSA9IHRoaXMuZ2V0Q29tbWFuZChidWlsZE9ubHkpO1xuICAgIGxvZy5kZWJ1ZyhgQmVnaW5uaW5nICR7YnVpbGRPbmx5ID8gJ2J1aWxkJyA6ICd0ZXN0J30gd2l0aCBjb21tYW5kICcke2NtZH0gJHthcmdzLmpvaW4oJyAnKX0nIGAgK1xuICAgICAgICAgICAgICBgaW4gZGlyZWN0b3J5ICcke3RoaXMuYm9vdHN0cmFwUGF0aH0nYCk7XG4gICAgY29uc3QgZW52ID0gT2JqZWN0LmFzc2lnbih7fSwgcHJvY2Vzcy5lbnYsIHtcbiAgICAgIFVTRV9QT1JUOiB0aGlzLndkYVJlbW90ZVBvcnQsXG4gICAgICBXREFfUFJPRFVDVF9CVU5ETEVfSURFTlRJRklFUjogdGhpcy51cGRhdGVkV0RBQnVuZGxlSWQgfHwgV0RBX1JVTk5FUl9CVU5ETEVfSUQsXG4gICAgfSk7XG4gICAgaWYgKHRoaXMubWpwZWdTZXJ2ZXJQb3J0KSB7XG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYXBwaXVtL1dlYkRyaXZlckFnZW50L3B1bGwvMTA1XG4gICAgICBlbnYuTUpQRUdfU0VSVkVSX1BPUlQgPSB0aGlzLm1qcGVnU2VydmVyUG9ydDtcbiAgICB9XG4gICAgY29uc3QgdXBncmFkZVRpbWVzdGFtcCA9IGF3YWl0IGdldFdEQVVwZ3JhZGVUaW1lc3RhbXAodGhpcy5ib290c3RyYXBQYXRoKTtcbiAgICBpZiAodXBncmFkZVRpbWVzdGFtcCkge1xuICAgICAgZW52LlVQR1JBREVfVElNRVNUQU1QID0gdXBncmFkZVRpbWVzdGFtcDtcbiAgICB9XG4gICAgY29uc3QgeGNvZGVidWlsZCA9IG5ldyBTdWJQcm9jZXNzKGNtZCwgYXJncywge1xuICAgICAgY3dkOiB0aGlzLmJvb3RzdHJhcFBhdGgsXG4gICAgICBlbnYsXG4gICAgICBkZXRhY2hlZDogdHJ1ZSxcbiAgICAgIHN0ZGlvOiBbJ2lnbm9yZScsICdwaXBlJywgJ3BpcGUnXSxcbiAgICB9KTtcblxuICAgIGxldCBsb2dYY29kZU91dHB1dCA9ICEhdGhpcy5zaG93WGNvZGVMb2c7XG4gICAgY29uc3QgbG9nTXNnID0gXy5pc0Jvb2xlYW4odGhpcy5zaG93WGNvZGVMb2cpXG4gICAgICA/IGBPdXRwdXQgZnJvbSB4Y29kZWJ1aWxkICR7dGhpcy5zaG93WGNvZGVMb2cgPyAnd2lsbCcgOiAnd2lsbCBub3QnfSBiZSBsb2dnZWRgXG4gICAgICA6ICdPdXRwdXQgZnJvbSB4Y29kZWJ1aWxkIHdpbGwgb25seSBiZSBsb2dnZWQgaWYgYW55IGVycm9ycyBhcmUgcHJlc2VudCB0aGVyZSc7XG4gICAgbG9nLmRlYnVnKGAke2xvZ01zZ30uIFRvIGNoYW5nZSB0aGlzLCB1c2UgJ3Nob3dYY29kZUxvZycgZGVzaXJlZCBjYXBhYmlsaXR5YCk7XG4gICAgeGNvZGVidWlsZC5vbignb3V0cHV0JywgKHN0ZG91dCwgc3RkZXJyKSA9PiB7XG4gICAgICBsZXQgb3V0ID0gc3Rkb3V0IHx8IHN0ZGVycjtcbiAgICAgIC8vIHdlIHdhbnQgdG8gcHVsbCBvdXQgdGhlIGxvZyBmaWxlIHRoYXQgaXMgY3JlYXRlZCwgYW5kIGhpZ2hsaWdodCBpdFxuICAgICAgLy8gZm9yIGRpYWdub3N0aWMgcHVycG9zZXNcbiAgICAgIGlmIChvdXQuaW5jbHVkZXMoJ1dyaXRpbmcgZGlhZ25vc3RpYyBsb2cgZm9yIHRlc3Qgc2Vzc2lvbiB0bycpKSB7XG4gICAgICAgIC8vIHB1bGwgb3V0IHRoZSBmaXJzdCBsaW5lIHRoYXQgYmVnaW5zIHdpdGggdGhlIHBhdGggc2VwYXJhdG9yXG4gICAgICAgIC8vIHdoaWNoICpzaG91bGQqIGJlIHRoZSBsaW5lIGluZGljYXRpbmcgdGhlIGxvZyBmaWxlIGdlbmVyYXRlZFxuICAgICAgICB4Y29kZWJ1aWxkLmxvZ0xvY2F0aW9uID0gXy5maXJzdChfLnJlbW92ZShvdXQudHJpbSgpLnNwbGl0KCdcXG4nKSwgKHYpID0+IHYuc3RhcnRzV2l0aChwYXRoLnNlcCkpKTtcbiAgICAgICAgbG9nLmRlYnVnKGBMb2cgZmlsZSBmb3IgeGNvZGVidWlsZCB0ZXN0OiAke3hjb2RlYnVpbGQubG9nTG9jYXRpb259YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIGlmIHdlIGhhdmUgYW4gZXJyb3Igd2Ugd2FudCB0byBvdXRwdXQgdGhlIGxvZ3NcbiAgICAgIC8vIG90aGVyd2lzZSB0aGUgZmFpbHVyZSBpcyBpbnNjcnV0aWJsZVxuICAgICAgLy8gYnV0IGRvIG5vdCBsb2cgcGVybWlzc2lvbiBlcnJvcnMgZnJvbSB0cnlpbmcgdG8gd3JpdGUgdG8gYXR0YWNobWVudHMgZm9sZGVyXG4gICAgICBjb25zdCBpZ25vcmVFcnJvciA9IElHTk9SRURfRVJST1JTLnNvbWUoKHgpID0+IG91dC5pbmNsdWRlcyh4KSk7XG4gICAgICBpZiAodGhpcy5zaG93WGNvZGVMb2cgIT09IGZhbHNlICYmIG91dC5pbmNsdWRlcygnRXJyb3IgRG9tYWluPScpICYmICFpZ25vcmVFcnJvcikge1xuICAgICAgICBsb2dYY29kZU91dHB1dCA9IHRydWU7XG5cbiAgICAgICAgLy8gdGVycmlibGUgaGFjayB0byBoYW5kbGUgY2FzZSB3aGVyZSB4Y29kZSByZXR1cm4gMCBidXQgaXMgZmFpbGluZ1xuICAgICAgICB4Y29kZWJ1aWxkLl93ZGFfZXJyb3Jfb2NjdXJyZWQgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBkbyBub3QgbG9nIHBlcm1pc3Npb24gZXJyb3JzIGZyb20gdHJ5aW5nIHRvIHdyaXRlIHRvIGF0dGFjaG1lbnRzIGZvbGRlclxuICAgICAgaWYgKGxvZ1hjb2RlT3V0cHV0ICYmICFpZ25vcmVFcnJvcikge1xuICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0LnNwbGl0KEVPTCkpIHtcbiAgICAgICAgICB4Y29kZUxvZy5lcnJvcihsaW5lKTtcbiAgICAgICAgICBpZiAobGluZSkge1xuICAgICAgICAgICAgeGNvZGVidWlsZC5fd2RhX2Vycm9yX21lc3NhZ2UgKz0gYCR7RU9MfSR7bGluZX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHhjb2RlYnVpbGQ7XG4gIH1cblxuICBhc3luYyBzdGFydCAoYnVpbGRPbmx5ID0gZmFsc2UpIHtcbiAgICB0aGlzLnhjb2RlYnVpbGQgPSBhd2FpdCB0aGlzLmNyZWF0ZVN1YlByb2Nlc3MoYnVpbGRPbmx5KTtcbiAgICAvLyBTdG9yZSB4Y29kZWJ1aWxkIG1lc3NhZ2VcbiAgICB0aGlzLnhjb2RlYnVpbGQuX3dkYV9lcnJvcl9tZXNzYWdlID0gJyc7XG5cbiAgICAvLyB3cmFwIHRoZSBzdGFydCBwcm9jZWR1cmUgaW4gYSBwcm9taXNlIHNvIHRoYXQgd2UgY2FuIGNhdGNoLCBhbmQgcmVwb3J0LFxuICAgIC8vIGFueSBzdGFydHVwIGVycm9ycyB0aGF0IGFyZSB0aHJvd24gYXMgZXZlbnRzXG4gICAgcmV0dXJuIGF3YWl0IG5ldyBCKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMueGNvZGVidWlsZC5vbignZXhpdCcsIGFzeW5jIChjb2RlLCBzaWduYWwpID0+IHtcbiAgICAgICAgbG9nLmVycm9yKGB4Y29kZWJ1aWxkIGV4aXRlZCB3aXRoIGNvZGUgJyR7Y29kZX0nIGFuZCBzaWduYWwgJyR7c2lnbmFsfSdgKTtcbiAgICAgICAgLy8gcHJpbnQgb3V0IHRoZSB4Y29kZWJ1aWxkIGZpbGUgaWYgdXNlcnMgaGF2ZSBhc2tlZCBmb3IgaXRcbiAgICAgICAgaWYgKHRoaXMuc2hvd1hjb2RlTG9nICYmIHRoaXMueGNvZGVidWlsZC5sb2dMb2NhdGlvbikge1xuICAgICAgICAgIHhjb2RlTG9nLmVycm9yKGBDb250ZW50cyBvZiB4Y29kZWJ1aWxkIGxvZyBmaWxlICcke3RoaXMueGNvZGVidWlsZC5sb2dMb2NhdGlvbn0nOmApO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZGF0YSA9IGF3YWl0IGZzLnJlYWRGaWxlKHRoaXMueGNvZGVidWlsZC5sb2dMb2NhdGlvbiwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGZvciAobGV0IGxpbmUgb2YgZGF0YS5zcGxpdCgnXFxuJykpIHtcbiAgICAgICAgICAgICAgeGNvZGVMb2cuZXJyb3IobGluZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBsb2cuZXJyb3IoYFVuYWJsZSB0byBhY2Nlc3MgeGNvZGVidWlsZCBsb2cgZmlsZTogJyR7ZXJyLm1lc3NhZ2V9J2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnhjb2RlYnVpbGQucHJvY2Vzc0V4aXRlZCA9IHRydWU7XG4gICAgICAgIGlmICh0aGlzLnhjb2RlYnVpbGQuX3dkYV9lcnJvcl9vY2N1cnJlZCB8fCAoIXNpZ25hbCAmJiBjb2RlICE9PSAwKSkge1xuICAgICAgICAgIHJldHVybiByZWplY3QobmV3IEVycm9yKGB4Y29kZWJ1aWxkIGZhaWxlZCB3aXRoIGNvZGUgJHtjb2RlfSR7RU9MfWAgK1xuICAgICAgICAgICAgYHhjb2RlYnVpbGQgZXJyb3IgbWVzc2FnZToke0VPTH0ke3RoaXMueGNvZGVidWlsZC5fd2RhX2Vycm9yX21lc3NhZ2V9YCkpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGluIHRoZSBjYXNlIG9mIGp1c3QgYnVpbGRpbmcsIHRoZSBwcm9jZXNzIHdpbGwgZXhpdCBhbmQgdGhhdCBpcyBvdXIgZmluaXNoXG4gICAgICAgIGlmIChidWlsZE9ubHkpIHtcbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgdGltZXIgPSBuZXcgdGltaW5nLlRpbWVyKCkuc3RhcnQoKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnhjb2RlYnVpbGQuc3RhcnQodHJ1ZSk7XG4gICAgICAgICAgaWYgKCFidWlsZE9ubHkpIHtcbiAgICAgICAgICAgIGxldCBzdGF0dXMgPSBhd2FpdCB0aGlzLndhaXRGb3JTdGFydCh0aW1lcik7XG4gICAgICAgICAgICByZXNvbHZlKHN0YXR1cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBsZXQgbXNnID0gYFVuYWJsZSB0byBzdGFydCBXZWJEcml2ZXJBZ2VudDogJHtlcnJ9YDtcbiAgICAgICAgICBsb2cuZXJyb3IobXNnKTtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKG1zZykpO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgd2FpdEZvclN0YXJ0ICh0aW1lcikge1xuICAgIC8vIHRyeSB0byBjb25uZWN0IG9uY2UgZXZlcnkgMC41IHNlY29uZHMsIHVudGlsIGBsYXVuY2hUaW1lb3V0YCBpcyB1cFxuICAgIGxvZy5kZWJ1ZyhgV2FpdGluZyB1cCB0byAke3RoaXMubGF1bmNoVGltZW91dH1tcyBmb3IgV2ViRHJpdmVyQWdlbnQgdG8gc3RhcnRgKTtcbiAgICBsZXQgY3VycmVudFN0YXR1cyA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgIGxldCByZXRyaWVzID0gcGFyc2VJbnQodGhpcy5sYXVuY2hUaW1lb3V0IC8gNTAwLCAxMCk7XG4gICAgICBhd2FpdCByZXRyeUludGVydmFsKHJldHJpZXMsIDEwMDAsIGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMueGNvZGVidWlsZC5wcm9jZXNzRXhpdGVkKSB7XG4gICAgICAgICAgLy8gdGhlcmUgaGFzIGJlZW4gYW4gZXJyb3IgZWxzZXdoZXJlIGFuZCB3ZSBuZWVkIHRvIHNob3J0LWNpcmN1aXRcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcHJveHlUaW1lb3V0ID0gdGhpcy5ub1Nlc3Npb25Qcm94eS50aW1lb3V0O1xuICAgICAgICB0aGlzLm5vU2Vzc2lvblByb3h5LnRpbWVvdXQgPSAxMDAwO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGN1cnJlbnRTdGF0dXMgPSBhd2FpdCB0aGlzLm5vU2Vzc2lvblByb3h5LmNvbW1hbmQoJy9zdGF0dXMnLCAnR0VUJyk7XG4gICAgICAgICAgaWYgKGN1cnJlbnRTdGF0dXMgJiYgY3VycmVudFN0YXR1cy5pb3MgJiYgY3VycmVudFN0YXR1cy5pb3MuaXApIHtcbiAgICAgICAgICAgIHRoaXMuYWdlbnRVcmwgPSBjdXJyZW50U3RhdHVzLmlvcy5pcDtcbiAgICAgICAgICB9XG4gICAgICAgICAgbG9nLmRlYnVnKGBXZWJEcml2ZXJBZ2VudCBpbmZvcm1hdGlvbjpgKTtcbiAgICAgICAgICBsb2cuZGVidWcoSlNPTi5zdHJpbmdpZnkoY3VycmVudFN0YXR1cywgbnVsbCwgMikpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBjb25uZWN0IHRvIHJ1bm5pbmcgV2ViRHJpdmVyQWdlbnQ6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgdGhpcy5ub1Nlc3Npb25Qcm94eS50aW1lb3V0ID0gcHJveHlUaW1lb3V0O1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKHRoaXMueGNvZGVidWlsZC5wcm9jZXNzRXhpdGVkKSB7XG4gICAgICAgIC8vIHRoZXJlIGhhcyBiZWVuIGFuIGVycm9yIGVsc2V3aGVyZSBhbmQgd2UgbmVlZCB0byBzaG9ydC1jaXJjdWl0XG4gICAgICAgIHJldHVybiBjdXJyZW50U3RhdHVzO1xuICAgICAgfVxuXG4gICAgICBsb2cuZGVidWcoYFdlYkRyaXZlckFnZW50IHN1Y2Nlc3NmdWxseSBzdGFydGVkIGFmdGVyICR7dGltZXIuZ2V0RHVyYXRpb24oKS5hc01pbGxpU2Vjb25kcy50b0ZpeGVkKDApfW1zYCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAvLyBhdCB0aGlzIHBvaW50LCBpZiB3ZSBoYXZlIG5vdCBoYWQgYW55IGVycm9ycyBmcm9tIHhjb2RlIGl0c2VsZiAocmVwb3J0ZWRcbiAgICAgIC8vIGVsc2V3aGVyZSksIHdlIGNhbiBsZXQgdGhpcyBnbyB0aHJvdWdoIGFuZCB0cnkgdG8gY3JlYXRlIHRoZSBzZXNzaW9uXG4gICAgICBsb2cuZGVidWcoZXJyLm1lc3NhZ2UpO1xuICAgICAgbG9nLndhcm4oYEdldHRpbmcgc3RhdHVzIG9mIFdlYkRyaXZlckFnZW50IG9uIGRldmljZSB0aW1lZCBvdXQuIENvbnRpbnVpbmdgKTtcbiAgICB9XG4gICAgcmV0dXJuIGN1cnJlbnRTdGF0dXM7XG4gIH1cblxuICBhc3luYyBxdWl0ICgpIHtcbiAgICBhd2FpdCBraWxsUHJvY2VzcygneGNvZGVidWlsZCcsIHRoaXMueGNvZGVidWlsZCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgWGNvZGVCdWlsZCB9O1xuZXhwb3J0IGRlZmF1bHQgWGNvZGVCdWlsZDtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFHQSxNQUFNQSxrQkFBa0IsR0FBRyxrQkFBM0I7QUFDQSxNQUFNQyxjQUFjLEdBQUcsQ0FBdkI7QUFDQSxNQUFNQyxpQkFBaUIsR0FBRyxzQkFBMUI7QUFDQSxNQUFNQyxjQUFjLEdBQUcsbUJBQXZCO0FBRUEsTUFBTUMsd0JBQXdCLEdBQUcsdUNBQWpDO0FBQ0EsTUFBTUMsd0JBQXdCLEdB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
