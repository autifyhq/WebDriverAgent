"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

require("source-map-support/register");

var _2 = require("../..");

var utils = _interopRequireWildcard(require("../../lib/utils"));

var _chai = _interopRequireDefault(require("chai"));

var _chaiAsPromised = _interopRequireDefault(require("chai-as-promised"));

var _path = _interopRequireDefault(require("path"));

var _lodash = _interopRequireDefault(require("lodash"));

var _sinon = _interopRequireDefault(require("sinon"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

_chai.default.should();

_chai.default.use(_chaiAsPromised.default);

const fakeConstructorArgs = {
  device: 'some sim',
  platformVersion: '9',
  host: 'me',
  port: '5000',
  realDevice: false
};

const defaultAgentPath = _path.default.resolve(_2.BOOTSTRAP_PATH, 'WebDriverAgent.xcodeproj');

const customBootstrapPath = '/path/to/wda';
const customAgentPath = '/path/to/some/agent/WebDriverAgent.xcodeproj';
const customDerivedDataPath = '/path/to/some/agent/DerivedData/';
describe('Constructor', function () {
  it('should have a default wda agent if not specified', function () {
    let agent = new _2.WebDriverAgent({}, fakeConstructorArgs);
    agent.bootstrapPath.should.eql(_2.BOOTSTRAP_PATH);
    agent.agentPath.should.eql(defaultAgentPath);
  });
  it('should have custom wda bootstrap and default agent if only bootstrap specified', function () {
    let agent = new _2.WebDriverAgent({}, _lodash.default.defaults({
      bootstrapPath: customBootstrapPath
    }, fakeConstructorArgs));
    agent.bootstrapPath.should.eql(customBootstrapPath);
    agent.agentPath.should.eql(_path.default.resolve(customBootstrapPath, 'WebDriverAgent.xcodeproj'));
  });
  it('should have custom wda bootstrap and agent if both specified', function () {
    let agent = new _2.WebDriverAgent({}, _lodash.default.defaults({
      bootstrapPath: customBootstrapPath,
      agentPath: customAgentPath
    }, fakeConstructorArgs));
    agent.bootstrapPath.should.eql(customBootstrapPath);
    agent.agentPath.should.eql(customAgentPath);
  });
  it('should have custom derivedDataPath if specified', function () {
    let agent = new _2.WebDriverAgent({}, _lodash.default.defaults({
      derivedDataPath: customDerivedDataPath
    }, fakeConstructorArgs));
    agent.xcodebuild.derivedDataPath.should.eql(customDerivedDataPath);
  });
});
describe('launch', function () {
  it('should use webDriverAgentUrl override and return current status', async function () {
    const override = 'http://mockurl:8100/';
    const args = Object.assign({}, fakeConstructorArgs);
    args.webDriverAgentUrl = override;
    const agent = new _2.WebDriverAgent({}, args);

    const wdaStub = _sinon.default.stub(agent, 'getStatus');

    wdaStub.callsFake(function () {
      return {
        build: 'data'
      };
    });
    await agent.launch('sessionId').should.eventually.eql({
      build: 'data'
    });
    agent.url.href.should.eql(override);
    agent.jwproxy.server.should.eql('mockurl');
    agent.jwproxy.port.should.eql('8100');
    agent.jwproxy.base.should.eql('');
    agent.noSessionProxy.server.should.eql('mockurl');
    agent.noSessionProxy.port.should.eql('8100');
    agent.noSessionProxy.base.should.eql('');
    wdaStub.reset();
  });
});
describe('use wda proxy url', function () {
  it('should use webDriverAgentUrl wda proxy url', async function () {
    const override = 'http://127.0.0.1:8100/aabbccdd';
    const args = Object.assign({}, fakeConstructorArgs);
    args.webDriverAgentUrl = override;
    const agent = new _2.WebDriverAgent({}, args);

    const wdaStub = _sinon.default.stub(agent, 'getStatus');

    wdaStub.callsFake(function () {
      return {
        build: 'data'
      };
    });
    await agent.launch('sessionId').should.eventually.eql({
      build: 'data'
    });
    agent.url.port.should.eql('8100');
    agent.url.hostname.should.eql('127.0.0.1');
    agent.url.path.should.eql('/aabbccdd');
    agent.jwproxy.server.should.eql('127.0.0.1');
    agent.jwproxy.port.should.eql('8100');
    agent.jwproxy.base.should.eql('/aabbccdd');
    agent.noSessionProxy.server.should.eql('127.0.0.1');
    agent.noSessionProxy.port.should.eql('8100');
    agent.noSessionProxy.base.should.eql('/aabbccdd');
  });
});
describe('get url', function () {
  it('should use default WDA listening url', function () {
    const args = Object.assign({}, fakeConstructorArgs);
    const agent = new _2.WebDriverAgent({}, args);
    agent.url.href.should.eql('http://127.0.0.1:8100/');
  });
  it('should use default WDA listening url with emply base url', function () {
    const wdaLocalPort = '9100';
    const wdaBaseUrl = '';
    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = wdaBaseUrl;
    args.wdaLocalPort = wdaLocalPort;
    const agent = new _2.WebDriverAgent({}, args);
    agent.url.href.should.eql('http://127.0.0.1:9100/');
  });
  it('should use customised WDA listening url', function () {
    const wdaLocalPort = '9100';
    const wdaBaseUrl = 'http://mockurl';
    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = wdaBaseUrl;
    args.wdaLocalPort = wdaLocalPort;
    const agent = new _2.WebDriverAgent({}, args);
    agent.url.href.should.eql('http://mockurl:9100/');
  });
  it('should use customised WDA listening url with slash', function () {
    const wdaLocalPort = '9100';
    const wdaBaseUrl = 'http://mockurl/';
    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = wdaBaseUrl;
    args.wdaLocalPort = wdaLocalPort;
    const agent = new _2.WebDriverAgent({}, args);
    agent.url.href.should.eql('http://mockurl:9100/');
  });
  it('should use the given webDriverAgentUrl and ignore other params', function () {
    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = 'http://mockurl/';
    args.wdaLocalPort = '9100';
    args.webDriverAgentUrl = 'https://127.0.0.1:8100/';
    const agent = new _2.WebDriverAgent({}, args);
    agent.url.href.should.eql('https://127.0.0.1:8100/');
  });
});
describe('setupCaching()', function () {
  let wda;
  let wdaStub;
  let wdaStubUninstall;

  const getTimestampStub = _sinon.default.stub(utils, 'getWDAUpgradeTimestamp');

  beforeEach(function () {
    wda = new _2.WebDriverAgent('1');
    wdaStub = _sinon.default.stub(wda, 'getStatus');
    wdaStubUninstall = _sinon.default.stub(wda, 'uninstall');
  });
  afterEach(function () {
    for (const stub of [wdaStub, wdaStubUninstall, getTimestampStub]) {
      if (stub) {
        stub.reset();
      }
    }
  });
  it('should not call uninstall since no Running WDA', async function () {
    wdaStub.callsFake(function () {
      return null;
    });
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    _lodash.default.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });
  it('should not call uninstall since running WDA has only time', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {
          time: 'Jun 24 2018 17:08:21'
        }
      };
    });
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://127.0.0.1:8100/');
  });
  it('should call uninstall once since bundle id is not default without updatedWDABundleId capability', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {
          time: 'Jun 24 2018 17:08:21',
          productBundleIdentifier: 'com.example.WebDriverAgent'
        }
      };
    });
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
    _lodash.default.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });
  it('should call uninstall once since bundle id is different with updatedWDABundleId capability', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {
          time: 'Jun 24 2018 17:08:21',
          productBundleIdentifier: 'com.example.different.WebDriverAgent'
        }
      };
    });
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
    _lodash.default.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });
  it('should not call uninstall since bundle id is equal to updatedWDABundleId capability', async function () {
    wda = new _2.WebDriverAgent('1', {
      updatedWDABundleId: 'com.example.WebDriverAgent'
    });
    wdaStub = _sinon.default.stub(wda, 'getStatus');
    wdaStubUninstall = _sinon.default.stub(wda, 'uninstall');
    wdaStub.callsFake(function () {
      return {
        build: {
          time: 'Jun 24 2018 17:08:21',
          productBundleIdentifier: 'com.example.WebDriverAgent'
        }
      };
    });
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://127.0.0.1:8100/');
  });
  it('should call uninstall if current revision differs from the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {
          upgradedAt: '1'
        }
      };
    });
    getTimestampStub.callsFake(() => '2');
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
  });
  it('should not call uninstall if current revision is the same as the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {
          upgradedAt: '1'
        }
      };
    });
    getTimestampStub.callsFake(() => '1');
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
  });
  it('should not call uninstall if current revision cannot be retrieved from WDA status', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {}
      };
    });
    getTimestampStub.callsFake(() => '1');
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
  });
  it('should not call uninstall if current revision cannot be retrieved from the file system', async function () {
    wdaStub.callsFake(function () {
      return {
        build: {
          upgradedAt: '1'
        }
      };
    });
    getTimestampStub.callsFake(() => null);
    wdaStubUninstall.callsFake(_lodash.default.noop);
    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
  });
  describe('uninstall', function () {
    let device;
    let wda;
    let deviceGetBundleIdsStub;
    let deviceRemoveAppStub;
    beforeEach(function () {
      device = {
        getUserInstalledBundleIdsByBundleName: () => {},
        removeApp: () => {}
      };
      wda = new _2.WebDriverAgent('1', {
        device
      });
      deviceGetBundleIdsStub = _sinon.default.stub(device, 'getUserInstalledBundleIdsByBundleName');
      deviceRemoveAppStub = _sinon.default.stub(device, 'removeApp');
    });
    afterEach(function () {
      for (const stub of [deviceGetBundleIdsStub, deviceRemoveAppStub]) {
        if (stub) {
          stub.reset();
        }
      }
    });
    it('should not call uninstall', async function () {
      deviceGetBundleIdsStub.callsFake(() => []);
      await wda.uninstall();
      deviceGetBundleIdsStub.calledOnce.should.be.true;
      deviceRemoveAppStub.notCalled.should.be.true;
    });
    it('should call uninstall once', async function () {
      const uninstalledBundIds = [];
      deviceGetBundleIdsStub.callsFake(() => ['com.appium.WDA1']);
      deviceRemoveAppStub.callsFake(id => uninstalledBundIds.push(id));
      await wda.uninstall();
      deviceGetBundleIdsStub.calledOnce.should.be.true;
      deviceRemoveAppStub.calledOnce.should.be.true;
      uninstalledBundIds.should.eql(['com.appium.WDA1']);
    });
    it('should call uninstall twice', async function () {
      const uninstalledBundIds = [];
      deviceGetBundleIdsStub.callsFake(() => ['com.appium.WDA1', 'com.appium.WDA2']);
      deviceRemoveAppStub.callsFake(id => uninstalledBundIds.push(id));
      await wda.uninstall();
      deviceGetBundleIdsStub.calledOnce.should.be.true;
      deviceRemoveAppStub.calledTwice.should.be.true;
      uninstalledBundIds.should.eql(['com.appium.WDA1', 'com.appium.WDA2']);
    });
  });
});require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC91bml0L3dlYmRyaXZlcmFnZW50LXNwZWNzLmpzIiwibmFtZXMiOlsiY2hhaSIsInNob3VsZCIsInVzZSIsImNoYWlBc1Byb21pc2VkIiwiZmFrZUNvbnN0cnVjdG9yQXJncyIsImRldmljZSIsInBsYXRmb3JtVmVyc2lvbiIsImhvc3QiLCJwb3J0IiwicmVhbERldmljZSIsImRlZmF1bHRBZ2VudFBhdGgiLCJwYXRoIiwicmVzb2x2ZSIsIkJPT1RTVFJBUF9QQVRIIiwiY3VzdG9tQm9vdHN0cmFwUGF0aCIsImN1c3RvbUFnZW50UGF0aCIsImN1c3RvbURlcml2ZWREYXRhUGF0aCIsImRlc2NyaWJlIiwiaXQiLCJhZ2VudCIsIldlYkRyaXZlckFnZW50IiwiYm9vdHN0cmFwUGF0aCIsImVxbCIsImFnZW50UGF0aCIsIl8iLCJkZWZhdWx0cyIsImRlcml2ZWREYXRhUGF0aCIsInhjb2RlYnVpbGQiLCJvdmVycmlkZSIsImFyZ3MiLCJPYmplY3QiLCJhc3NpZ24iLCJ3ZWJEcml2ZXJBZ2VudFVybCIsIndkYVN0dWIiLCJzaW5vbiIsInN0dWIiLCJjYWxsc0Zha2UiLCJidWlsZCIsImxhdW5jaCIsImV2ZW50dWFsbHkiLCJ1cmwiLCJocmVmIiwiandwcm94eSIsInNlcnZlciIsImJhc2UiLCJub1Nlc3Npb25Qcm94eSIsInJlc2V0IiwiaG9zdG5hbWUiLCJ3ZGFMb2NhbFBvcnQiLCJ3ZGFCYXNlVXJsIiwid2RhIiwid2RhU3R1YlVuaW5zdGFsbCIsImdldFRpbWVzdGFtcFN0dWIiLCJ1dGlscyIsImJlZm9yZUVhY2giLCJhZnRlckVhY2giLCJub29wIiwic2V0dXBDYWNoaW5nIiwiY2FsbGVkT25jZSIsImJlIiwidHJ1ZSIsIm5vdENhbGxlZCIsImlzVW5kZWZpbmVkIiwidGltZSIsImVxdWFsIiwicHJvZHVjdEJ1bmRsZUlkZW50aWZpZXIiLCJ1cGRhdGVkV0RBQnVuZGxlSWQiLCJ1cGdyYWRlZEF0IiwiZGV2aWNlR2V0QnVuZGxlSWRzU3R1YiIsImRldmljZVJlbW92ZUFwcFN0dWIiLCJnZXRVc2VySW5zdGFsbGVkQnVuZGxlSWRzQnlCdW5kbGVOYW1lIiwicmVtb3ZlQXBwIiwidW5pbnN0YWxsIiwidW5pbnN0YWxsZWRCdW5kSWRzIiwiaWQiLCJwdXNoIiwiY2FsbGVkVHdpY2UiXSwic291cmNlUm9vdCI6Ii4uLy4uLy4uIiwic291cmNlcyI6WyJ0ZXN0L3VuaXQvd2ViZHJpdmVyYWdlbnQtc3BlY3MuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgV2ViRHJpdmVyQWdlbnQsIEJPT1RTVFJBUF9QQVRIIH0gZnJvbSAnLi4vLi4nO1xuaW1wb3J0ICogYXMgdXRpbHMgZnJvbSAnLi4vLi4vbGliL3V0aWxzJztcbmltcG9ydCBjaGFpIGZyb20gJ2NoYWknO1xuaW1wb3J0IGNoYWlBc1Byb21pc2VkIGZyb20gJ2NoYWktYXMtcHJvbWlzZWQnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHNpbm9uIGZyb20gJ3Npbm9uJztcblxuXG5jaGFpLnNob3VsZCgpO1xuY2hhaS51c2UoY2hhaUFzUHJvbWlzZWQpO1xuXG5jb25zdCBmYWtlQ29uc3RydWN0b3JBcmdzID0ge1xuICBkZXZpY2U6ICdzb21lIHNpbScsXG4gIHBsYXRmb3JtVmVyc2lvbjogJzknLFxuICBob3N0OiAnbWUnLFxuICBwb3J0OiAnNTAwMCcsXG4gIHJlYWxEZXZpY2U6IGZhbHNlXG59O1xuXG5jb25zdCBkZWZhdWx0QWdlbnRQYXRoID0gcGF0aC5yZXNvbHZlKEJPT1RTVFJBUF9QQVRILCAnV2ViRHJpdmVyQWdlbnQueGNvZGVwcm9qJyk7XG5jb25zdCBjdXN0b21Cb290c3RyYXBQYXRoID0gJy9wYXRoL3RvL3dkYSc7XG5jb25zdCBjdXN0b21BZ2VudFBhdGggPSAnL3BhdGgvdG8vc29tZS9hZ2VudC9XZWJEcml2ZXJBZ2VudC54Y29kZXByb2onO1xuY29uc3QgY3VzdG9tRGVyaXZlZERhdGFQYXRoID0gJy9wYXRoL3RvL3NvbWUvYWdlbnQvRGVyaXZlZERhdGEvJztcblxuZGVzY3JpYmUoJ0NvbnN0cnVjdG9yJywgZnVuY3Rpb24gKCkge1xuICBpdCgnc2hvdWxkIGhhdmUgYSBkZWZhdWx0IHdkYSBhZ2VudCBpZiBub3Qgc3BlY2lmaWVkJywgZnVuY3Rpb24gKCkge1xuICAgIGxldCBhZ2VudCA9IG5ldyBXZWJEcml2ZXJBZ2VudCh7fSwgZmFrZUNvbnN0cnVjdG9yQXJncyk7XG4gICAgYWdlbnQuYm9vdHN0cmFwUGF0aC5zaG91bGQuZXFsKEJPT1RTVFJBUF9QQVRIKTtcbiAgICBhZ2VudC5hZ2VudFBhdGguc2hvdWxkLmVxbChkZWZhdWx0QWdlbnRQYXRoKTtcbiAgfSk7XG4gIGl0KCdzaG91bGQgaGF2ZSBjdXN0b20gd2RhIGJvb3RzdHJhcCBhbmQgZGVmYXVsdCBhZ2VudCBpZiBvbmx5IGJvb3RzdHJhcCBzcGVjaWZpZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IGFnZW50ID0gbmV3IFdlYkRyaXZlckFnZW50KHt9LCBfLmRlZmF1bHRzKHtcbiAgICAgIGJvb3RzdHJhcFBhdGg6IGN1c3RvbUJvb3RzdHJhcFBhdGgsXG4gICAgfSwgZmFrZUNvbnN0cnVjdG9yQXJncykpO1xuICAgIGFnZW50LmJvb3RzdHJhcFBhdGguc2hvdWxkLmVxbChjdXN0b21Cb290c3RyYXBQYXRoKTtcbiAgICBhZ2VudC5hZ2VudFBhdGguc2hvdWxkLmVxbChwYXRoLnJlc29sdmUoY3VzdG9tQm9vdHN0cmFwUGF0aCwgJ1dlYkRyaXZlckFnZW50Lnhjb2RlcHJvaicpKTtcbiAgfSk7XG4gIGl0KCdzaG91bGQgaGF2ZSBjdXN0b20gd2RhIGJvb3RzdHJhcCBhbmQgYWdlbnQgaWYgYm90aCBzcGVjaWZpZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IGFnZW50ID0gbmV3IFdlYkRyaXZlckFnZW50KHt9LCBfLmRlZmF1bHRzKHtcbiAgICAgIGJvb3RzdHJhcFBhdGg6IGN1c3RvbUJvb3RzdHJhcFBhdGgsXG4gICAgICBhZ2VudFBhdGg6IGN1c3RvbUFnZW50UGF0aCxcbiAgICB9LCBmYWtlQ29uc3RydWN0b3JBcmdzKSk7XG4gICAgYWdlbnQuYm9vdHN0cmFwUGF0aC5zaG91bGQuZXFsKGN1c3RvbUJvb3RzdHJhcFBhdGgpO1xuICAgIGFnZW50LmFnZW50UGF0aC5zaG91bGQuZXFsKGN1c3RvbUFnZW50UGF0aCk7XG4gIH0pO1xuICBpdCgnc2hvdWxkIGhhdmUgY3VzdG9tIGRlcml2ZWREYXRhUGF0aCBpZiBzcGVjaWZpZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IGFnZW50ID0gbmV3IFdlYkRyaXZlckFnZW50KHt9LCBfLmRlZmF1bHRzKHtcbiAgICAgIGRlcml2ZWREYXRhUGF0aDogY3VzdG9tRGVyaXZlZERhdGFQYXRoXG4gICAgfSwgZmFrZUNvbnN0cnVjdG9yQXJncykpO1xuICAgIGFnZW50Lnhjb2RlYnVpbGQuZGVyaXZlZERhdGFQYXRoLnNob3VsZC5lcWwoY3VzdG9tRGVyaXZlZERhdGFQYXRoKTtcbiAgfSk7XG59KTtcblxuZGVzY3JpYmUoJ2xhdW5jaCcsIGZ1bmN0aW9uICgpIHtcbiAgaXQoJ3Nob3VsZCB1c2Ugd2ViRHJpdmVyQWdlbnRVcmwgb3ZlcnJpZGUgYW5kIHJldHVybiBjdXJyZW50IHN0YXR1cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBvdmVycmlkZSA9ICdodHRwOi8vbW9ja3VybDo4MTAwLyc7XG4gICAgY29uc3QgYXJncyA9IE9iamVjdC5hc3NpZ24oe30sIGZha2VDb25zdHJ1Y3RvckFyZ3MpO1xuICAgIGFyZ3Mud2ViRHJpdmVyQWdlbnRVcmwgPSBvdmVycmlkZTtcbiAgICBjb25zdCBhZ2VudCA9IG5ldyBXZWJEcml2ZXJBZ2VudCh7fSwgYXJncyk7XG4gICAgY29uc3Qgd2RhU3R1YiA9IHNpbm9uLnN0dWIoYWdlbnQsICdnZXRTdGF0dXMnKTtcbiAgICB3ZGFTdHViLmNhbGxzRmFrZShmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge2J1aWxkOiAnZGF0YSd9O1xuICAgIH0pO1xuXG4gICAgYXdhaXQgYWdlbnQubGF1bmNoKCdzZXNzaW9uSWQnKS5zaG91bGQuZXZlbnR1YWxseS5lcWwoe2J1aWxkOiAnZGF0YSd9KTtcbiAgICBhZ2VudC51cmwuaHJlZi5zaG91bGQuZXFsKG92ZXJyaWRlKTtcbiAgICBhZ2VudC5qd3Byb3h5LnNlcnZlci5zaG91bGQuZXFsKCdtb2NrdXJsJyk7XG4gICAgYWdlbnQuandwcm94eS5wb3J0LnNob3VsZC5lcWwoJzgxMDAnKTtcbiAgICBhZ2VudC5qd3Byb3h5LmJhc2Uuc2hvdWxkLmVxbCgnJyk7XG4gICAgYWdlbnQubm9TZXNzaW9uUHJveHkuc2VydmVyLnNob3VsZC5lcWwoJ21vY2t1cmwnKTtcbiAgICBhZ2VudC5ub1Nlc3Npb25Qcm94eS5wb3J0LnNob3VsZC5lcWwoJzgxMDAnKTtcbiAgICBhZ2VudC5ub1Nlc3Npb25Qcm94eS5iYXNlLnNob3VsZC5lcWwoJycpO1xuICAgIHdkYVN0dWIucmVzZXQoKTtcbiAgfSk7XG59KTtcblxuZGVzY3JpYmUoJ3VzZSB3ZGEgcHJveHkgdXJsJywgZnVuY3Rpb24gKCkge1xuICBpdCgnc2hvdWxkIHVzZSB3ZWJEcml2ZXJBZ2VudFVybCB3ZGEgcHJveHkgdXJsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG92ZXJyaWRlID0gJ2h0dHA6Ly8xMjcuMC4wLjE6ODEwMC9hYWJiY2NkZCc7XG4gICAgY29uc3QgYXJncyA9IE9iamVjdC5hc3NpZ24oe30sIGZha2VDb25zdHJ1Y3RvckFyZ3MpO1xuICAgIGFyZ3Mud2ViRHJpdmVyQWdlbnRVcmwgPSBvdmVycmlkZTtcbiAgICBjb25zdCBhZ2VudCA9IG5ldyBXZWJEcml2ZXJBZ2VudCh7fSwgYXJncyk7XG4gICAgY29uc3Qgd2RhU3R1YiA9IHNpbm9uLnN0dWIoYWdlbnQsICdnZXRTdGF0dXMnKTtcbiAgICB3ZGFTdHViLmNhbGxzRmFrZShmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge2J1aWxkOiAnZGF0YSd9O1xuICAgIH0pO1xuXG4gICAgYXdhaXQgYWdlbnQubGF1bmNoKCdzZXNzaW9uSWQnKS5zaG91bGQuZXZlbnR1YWxseS5lcWwoe2J1aWxkOiAnZGF0YSd9KTtcblxuICAgIGFnZW50LnVybC5wb3J0LnNob3VsZC5lcWwoJzgxMDAnKTtcbiAgICBhZ2VudC51cmwuaG9zdG5hbWUuc2hvdWxkLmVxbCgnMTI3LjAuMC4xJyk7XG4gICAgYWdlbnQudXJsLnBhdGguc2hvdWxkLmVxbCgnL2FhYmJjY2RkJyk7XG4gICAgYWdlbnQuandwcm94eS5zZXJ2ZXIuc2hvdWxkLmVxbCgnMTI3LjAuMC4xJyk7XG4gICAgYWdlbnQuandwcm94eS5wb3J0LnNob3VsZC5lcWwoJzgxMDAnKTtcbiAgICBhZ2VudC5qd3Byb3h5LmJhc2Uuc2hvdWxkLmVxbCgnL2FhYmJjY2RkJyk7XG4gICAgYWdlbnQubm9TZXNzaW9uUHJveHkuc2VydmVyLnNob3VsZC5lcWwoJzEyNy4wLjAuMScpO1xuICAgIGFnZW50Lm5vU2Vzc2lvblByb3h5LnBvcnQuc2hvdWxkLmVxbCgnODEwMCcpO1xuICAgIGFnZW50Lm5vU2Vzc2lvblByb3h5LmJhc2Uuc2hvdWxkLmVxbCgnL2FhYmJjY2RkJyk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKCdnZXQgdXJsJywgZnVuY3Rpb24gKCkge1xuICBpdCgnc2hvdWxkIHVzZSBkZWZhdWx0IFdEQSBsaXN0ZW5pbmcgdXJsJywgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IGFyZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBmYWtlQ29uc3RydWN0b3JBcmdzKTtcbiAgICBjb25zdCBhZ2VudCA9IG5ldyBXZWJEcml2ZXJBZ2VudCh7fSwgYXJncyk7XG4gICAgYWdlbnQudXJsLmhyZWYuc2hvdWxkLmVxbCgnaHR0cDovLzEyNy4wLjAuMTo4MTAwLycpO1xuICB9KTtcbiAgaXQoJ3Nob3VsZCB1c2UgZGVmYXVsdCBXREEgbGlzdGVuaW5nIHVybCB3aXRoIGVtcGx5IGJhc2UgdXJsJywgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHdkYUxvY2FsUG9ydCA9ICc5MTAwJztcbiAgICBjb25zdCB3ZGFCYXNlVXJsID0gJyc7XG5cbiAgICBjb25zdCBhcmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZmFrZUNvbnN0cnVjdG9yQXJncyk7XG4gICAgYXJncy53ZGFCYXNlVXJsID0gd2RhQmFzZVVybDtcbiAgICBhcmdzLndkYUxvY2FsUG9ydCA9IHdkYUxvY2FsUG9ydDtcblxuICAgIGNvbnN0IGFnZW50ID0gbmV3IFdlYkRyaXZlckFnZW50KHt9LCBhcmdzKTtcbiAgICBhZ2VudC51cmwuaHJlZi5zaG91bGQuZXFsKCdodHRwOi8vMTI3LjAuMC4xOjkxMDAvJyk7XG4gIH0pO1xuICBpdCgnc2hvdWxkIHVzZSBjdXN0b21pc2VkIFdEQSBsaXN0ZW5pbmcgdXJsJywgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHdkYUxvY2FsUG9ydCA9ICc5MTAwJztcbiAgICBjb25zdCB3ZGFCYXNlVXJsID0gJ2h0dHA6Ly9tb2NrdXJsJztcblxuICAgIGNvbnN0IGFyZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBmYWtlQ29uc3RydWN0b3JBcmdzKTtcbiAgICBhcmdzLndkYUJhc2VVcmwgPSB3ZGFCYXNlVXJsO1xuICAgIGFyZ3Mud2RhTG9jYWxQb3J0ID0gd2RhTG9jYWxQb3J0O1xuXG4gICAgY29uc3QgYWdlbnQgPSBuZXcgV2ViRHJpdmVyQWdlbnQoe30sIGFyZ3MpO1xuICAgIGFnZW50LnVybC5ocmVmLnNob3VsZC5lcWwoJ2h0dHA6Ly9tb2NrdXJsOjkxMDAvJyk7XG4gIH0pO1xuICBpdCgnc2hvdWxkIHVzZSBjdXN0b21pc2VkIFdEQSBsaXN0ZW5pbmcgdXJsIHdpdGggc2xhc2gnLCBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd2RhTG9jYWxQb3J0ID0gJzkxMDAnO1xuICAgIGNvbnN0IHdkYUJhc2VVcmwgPSAnaHR0cDovL21vY2t1cmwvJztcblxuICAgIGNvbnN0IGFyZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBmYWtlQ29uc3RydWN0b3JBcmdzKTtcbiAgICBhcmdzLndkYUJhc2VVcmwgPSB3ZGFCYXNlVXJsO1xuICAgIGFyZ3Mud2RhTG9jYWxQb3J0ID0gd2RhTG9jYWxQb3J0O1xuXG4gICAgY29uc3QgYWdlbnQgPSBuZXcgV2ViRHJpdmVyQWdlbnQoe30sIGFyZ3MpO1xuICAgIGFnZW50LnVybC5ocmVmLnNob3VsZC5lcWwoJ2h0dHA6Ly9tb2NrdXJsOjkxMDAvJyk7XG4gIH0pO1xuICBpdCgnc2hvdWxkIHVzZSB0aGUgZ2l2ZW4gd2ViRHJpdmVyQWdlbnRVcmwgYW5kIGlnbm9yZSBvdGhlciBwYXJhbXMnLCBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgYXJncyA9IE9iamVjdC5hc3NpZ24oe30sIGZha2VDb25zdHJ1Y3RvckFyZ3MpO1xuICAgIGFyZ3Mud2RhQmFzZVVybCA9ICdodHRwOi8vbW9ja3VybC8nO1xuICAgIGFyZ3Mud2RhTG9jYWxQb3J0ID0gJzkxMDAnO1xuICAgIGFyZ3Mud2ViRHJpdmVyQWdlbnRVcmwgPSAnaHR0cHM6Ly8xMjcuMC4wLjE6ODEwMC8nO1xuXG4gICAgY29uc3QgYWdlbnQgPSBuZXcgV2ViRHJpdmVyQWdlbnQoe30sIGFyZ3MpO1xuICAgIGFnZW50LnVybC5ocmVmLnNob3VsZC5lcWwoJ2h0dHBzOi8vMTI3LjAuMC4xOjgxMDAvJyk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKCdzZXR1cENhY2hpbmcoKScsIGZ1bmN0aW9uICgpIHtcbiAgbGV0IHdkYTtcbiAgbGV0IHdkYVN0dWI7XG4gIGxldCB3ZGFTdHViVW5pbnN0YWxsO1xuICBjb25zdCBnZXRUaW1lc3RhbXBTdHViID0gc2lub24uc3R1Yih1dGlscywgJ2dldFdEQVVwZ3JhZGVUaW1lc3RhbXAnKTtcblxuICBiZWZvcmVFYWNoKGZ1bmN0aW9uICgpIHtcbiAgICB3ZGEgPSBuZXcgV2ViRHJpdmVyQWdlbnQoJzEnKTtcbiAgICB3ZGFTdHViID0gc2lub24uc3R1Yih3ZGEsICdnZXRTdGF0dXMnKTtcbiAgICB3ZGFTdHViVW5pbnN0YWxsID0gc2lub24uc3R1Yih3ZGEsICd1bmluc3RhbGwnKTtcbiAgfSk7XG5cbiAgYWZ0ZXJFYWNoKGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKGNvbnN0IHN0dWIgb2YgW3dkYVN0dWIsIHdkYVN0dWJVbmluc3RhbGwsIGdldFRpbWVzdGFtcFN0dWJdKSB7XG4gICAgICBpZiAoc3R1Yikge1xuICAgICAgICBzdHViLnJlc2V0KCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBpdCgnc2hvdWxkIG5vdCBjYWxsIHVuaW5zdGFsbCBzaW5jZSBubyBSdW5uaW5nIFdEQScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB3ZGFTdHViLmNhbGxzRmFrZShmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9KTtcbiAgICB3ZGFTdHViVW5pbnN0YWxsLmNhbGxzRmFrZShfLm5vb3ApO1xuXG4gICAgYXdhaXQgd2RhLnNldHVwQ2FjaGluZygpO1xuICAgIHdkYVN0dWIuY2FsbGVkT25jZS5zaG91bGQuYmUudHJ1ZTtcbiAgICB3ZGFTdHViVW5pbnN0YWxsLm5vdENhbGxlZC5zaG91bGQuYmUudHJ1ZTtcbiAgICBfLmlzVW5kZWZpbmVkKHdkYS53ZWJEcml2ZXJBZ2VudFVybCkuc2hvdWxkLmJlLnRydWU7XG4gIH0pO1xuXG4gIGl0KCdzaG91bGQgbm90IGNhbGwgdW5pbnN0YWxsIHNpbmNlIHJ1bm5pbmcgV0RBIGhhcyBvbmx5IHRpbWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgd2RhU3R1Yi5jYWxsc0Zha2UoZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtidWlsZDogeyB0aW1lOiAnSnVuIDI0IDIwMTggMTc6MDg6MjEnIH19O1xuICAgIH0pO1xuICAgIHdkYVN0dWJVbmluc3RhbGwuY2FsbHNGYWtlKF8ubm9vcCk7XG5cbiAgICBhd2FpdCB3ZGEuc2V0dXBDYWNoaW5nKCk7XG4gICAgd2RhU3R1Yi5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgIHdkYVN0dWJVbmluc3RhbGwubm90Q2FsbGVkLnNob3VsZC5iZS50cnVlO1xuICAgIHdkYS53ZWJEcml2ZXJBZ2VudFVybC5zaG91bGQuZXF1YWwoJ2h0dHA6Ly8xMjcuMC4wLjE6ODEwMC8nKTtcbiAgfSk7XG5cbiAgaXQoJ3Nob3VsZCBjYWxsIHVuaW5zdGFsbCBvbmNlIHNpbmNlIGJ1bmRsZSBpZCBpcyBub3QgZGVmYXVsdCB3aXRob3V0IHVwZGF0ZWRXREFCdW5kbGVJZCBjYXBhYmlsaXR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHdkYVN0dWIuY2FsbHNGYWtlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7YnVpbGQ6IHsgdGltZTogJ0p1biAyNCAyMDE4IDE3OjA4OjIxJywgcHJvZHVjdEJ1bmRsZUlkZW50aWZpZXI6ICdjb20uZXhhbXBsZS5XZWJEcml2ZXJBZ2VudCcgfX07XG4gICAgfSk7XG4gICAgd2RhU3R1YlVuaW5zdGFsbC5jYWxsc0Zha2UoXy5ub29wKTtcblxuICAgIGF3YWl0IHdkYS5zZXR1cENhY2hpbmcoKTtcbiAgICB3ZGFTdHViLmNhbGxlZE9uY2Uuc2hvdWxkLmJlLnRydWU7XG4gICAgd2RhU3R1YlVuaW5zdGFsbC5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgIF8uaXNVbmRlZmluZWQod2RhLndlYkRyaXZlckFnZW50VXJsKS5zaG91bGQuYmUudHJ1ZTtcbiAgfSk7XG5cbiAgaXQoJ3Nob3VsZCBjYWxsIHVuaW5zdGFsbCBvbmNlIHNpbmNlIGJ1bmRsZSBpZCBpcyBkaWZmZXJlbnQgd2l0aCB1cGRhdGVkV0RBQnVuZGxlSWQgY2FwYWJpbGl0eScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB3ZGFTdHViLmNhbGxzRmFrZShmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge2J1aWxkOiB7IHRpbWU6ICdKdW4gMjQgMjAxOCAxNzowODoyMScsIHByb2R1Y3RCdW5kbGVJZGVudGlmaWVyOiAnY29tLmV4YW1wbGUuZGlmZmVyZW50LldlYkRyaXZlckFnZW50JyB9fTtcbiAgICB9KTtcblxuICAgIHdkYVN0dWJVbmluc3RhbGwuY2FsbHNGYWtlKF8ubm9vcCk7XG5cbiAgICBhd2FpdCB3ZGEuc2V0dXBDYWNoaW5nKCk7XG4gICAgd2RhU3R1Yi5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgIHdkYVN0dWJVbmluc3RhbGwuY2FsbGVkT25jZS5zaG91bGQuYmUudHJ1ZTtcbiAgICBfLmlzVW5kZWZpbmVkKHdkYS53ZWJEcml2ZXJBZ2VudFVybCkuc2hvdWxkLmJlLnRydWU7XG4gIH0pO1xuXG4gIGl0KCdzaG91bGQgbm90IGNhbGwgdW5pbnN0YWxsIHNpbmNlIGJ1bmRsZSBpZCBpcyBlcXVhbCB0byB1cGRhdGVkV0RBQnVuZGxlSWQgY2FwYWJpbGl0eScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB3ZGEgPSBuZXcgV2ViRHJpdmVyQWdlbnQoJzEnLCB7IHVwZGF0ZWRXREFCdW5kbGVJZDogJ2NvbS5leGFtcGxlLldlYkRyaXZlckFnZW50JyB9KTtcbiAgICB3ZGFTdHViID0gc2lub24uc3R1Yih3ZGEsICdnZXRTdGF0dXMnKTtcbiAgICB3ZGFTdHViVW5pbnN0YWxsID0gc2lub24uc3R1Yih3ZGEsICd1bmluc3RhbGwnKTtcblxuICAgIHdkYVN0dWIuY2FsbHNGYWtlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7YnVpbGQ6IHsgdGltZTogJ0p1biAyNCAyMDE4IDE3OjA4OjIxJywgcHJvZHVjdEJ1bmRsZUlkZW50aWZpZXI6ICdjb20uZXhhbXBsZS5XZWJEcml2ZXJBZ2VudCcgfX07XG4gICAgfSk7XG5cbiAgICB3ZGFTdHViVW5pbnN0YWxsLmNhbGxzRmFrZShfLm5vb3ApO1xuXG4gICAgYXdhaXQgd2RhLnNldHVwQ2FjaGluZygpO1xuICAgIHdkYVN0dWIuY2FsbGVkT25jZS5zaG91bGQuYmUudHJ1ZTtcbiAgICB3ZGFTdHViVW5pbnN0YWxsLm5vdENhbGxlZC5zaG91bGQuYmUudHJ1ZTtcbiAgICB3ZGEud2ViRHJpdmVyQWdlbnRVcmwuc2hvdWxkLmVxdWFsKCdodHRwOi8vMTI3LjAuMC4xOjgxMDAvJyk7XG4gIH0pO1xuXG4gIGl0KCdzaG91bGQgY2FsbCB1bmluc3RhbGwgaWYgY3VycmVudCByZXZpc2lvbiBkaWZmZXJzIGZyb20gdGhlIGJ1bmRsZWQgb25lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHdkYVN0dWIuY2FsbHNGYWtlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7YnVpbGQ6IHsgdXBncmFkZWRBdDogJzEnIH19O1xuICAgIH0pO1xuICAgIGdldFRpbWVzdGFtcFN0dWIuY2FsbHNGYWtlKCgpID0+ICcyJyk7XG4gICAgd2RhU3R1YlVuaW5zdGFsbC5jYWxsc0Zha2UoXy5ub29wKTtcblxuICAgIGF3YWl0IHdkYS5zZXR1cENhY2hpbmcoKTtcbiAgICB3ZGFTdHViLmNhbGxlZE9uY2Uuc2hvdWxkLmJlLnRydWU7XG4gICAgd2RhU3R1YlVuaW5zdGFsbC5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIG5vdCBjYWxsIHVuaW5zdGFsbCBpZiBjdXJyZW50IHJldmlzaW9uIGlzIHRoZSBzYW1lIGFzIHRoZSBidW5kbGVkIG9uZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB3ZGFTdHViLmNhbGxzRmFrZShmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4ge2J1aWxkOiB7IHVwZ3JhZGVkQXQ6ICcxJyB9fTtcbiAgICB9KTtcbiAgICBnZXRUaW1lc3RhbXBTdHViLmNhbGxzRmFrZSgoKSA9PiAnMScpO1xuICAgIHdkYVN0dWJVbmluc3RhbGwuY2FsbHNGYWtlKF8ubm9vcCk7XG5cbiAgICBhd2FpdCB3ZGEuc2V0dXBDYWNoaW5nKCk7XG4gICAgd2RhU3R1Yi5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgIHdkYVN0dWJVbmluc3RhbGwubm90Q2FsbGVkLnNob3VsZC5iZS50cnVlO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIG5vdCBjYWxsIHVuaW5zdGFsbCBpZiBjdXJyZW50IHJldmlzaW9uIGNhbm5vdCBiZSByZXRyaWV2ZWQgZnJvbSBXREEgc3RhdHVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHdkYVN0dWIuY2FsbHNGYWtlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB7YnVpbGQ6IHt9fTtcbiAgICB9KTtcbiAgICBnZXRUaW1lc3RhbXBTdHViLmNhbGxzRmFrZSgoKSA9PiAnMScpO1xuICAgIHdkYVN0dWJVbmluc3RhbGwuY2FsbHNGYWtlKF8ubm9vcCk7XG5cbiAgICBhd2FpdCB3ZGEuc2V0dXBDYWNoaW5nKCk7XG4gICAgd2RhU3R1Yi5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgIHdkYVN0dWJVbmluc3RhbGwubm90Q2FsbGVkLnNob3VsZC5iZS50cnVlO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIG5vdCBjYWxsIHVuaW5zdGFsbCBpZiBjdXJyZW50IHJldmlzaW9uIGNhbm5vdCBiZSByZXRyaWV2ZWQgZnJvbSB0aGUgZmlsZSBzeXN0ZW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgd2RhU3R1Yi5jYWxsc0Zha2UoZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHtidWlsZDogeyB1cGdyYWRlZEF0OiAnMScgfX07XG4gICAgfSk7XG4gICAgZ2V0VGltZXN0YW1wU3R1Yi5jYWxsc0Zha2UoKCkgPT4gbnVsbCk7XG4gICAgd2RhU3R1YlVuaW5zdGFsbC5jYWxsc0Zha2UoXy5ub29wKTtcblxuICAgIGF3YWl0IHdkYS5zZXR1cENhY2hpbmcoKTtcbiAgICB3ZGFTdHViLmNhbGxlZE9uY2Uuc2hvdWxkLmJlLnRydWU7XG4gICAgd2RhU3R1YlVuaW5zdGFsbC5ub3RDYWxsZWQuc2hvdWxkLmJlLnRydWU7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCd1bmluc3RhbGwnLCBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IGRldmljZTtcbiAgICBsZXQgd2RhO1xuICAgIGxldCBkZXZpY2VHZXRCdW5kbGVJZHNTdHViO1xuICAgIGxldCBkZXZpY2VSZW1vdmVBcHBTdHViO1xuXG4gICAgYmVmb3JlRWFjaChmdW5jdGlvbiAoKSB7XG4gICAgICBkZXZpY2UgPSB7XG4gICAgICAgIGdldFVzZXJJbnN0YWxsZWRCdW5kbGVJZHNCeUJ1bmRsZU5hbWU6ICgpID0+IHt9LFxuICAgICAgICByZW1vdmVBcHA6ICgpID0+IHt9XG4gICAgICB9O1xuICAgICAgd2RhID0gbmV3IFdlYkRyaXZlckFnZW50KCcxJywge2RldmljZX0pO1xuICAgICAgZGV2aWNlR2V0QnVuZGxlSWRzU3R1YiA9IHNpbm9uLnN0dWIoZGV2aWNlLCAnZ2V0VXNlckluc3RhbGxlZEJ1bmRsZUlkc0J5QnVuZGxlTmFtZScpO1xuICAgICAgZGV2aWNlUmVtb3ZlQXBwU3R1YiA9IHNpbm9uLnN0dWIoZGV2aWNlLCAncmVtb3ZlQXBwJyk7XG4gICAgfSk7XG5cbiAgICBhZnRlckVhY2goZnVuY3Rpb24gKCkge1xuICAgICAgZm9yIChjb25zdCBzdHViIG9mIFtkZXZpY2VHZXRCdW5kbGVJZHNTdHViLCBkZXZpY2VSZW1vdmVBcHBTdHViXSkge1xuICAgICAgICBpZiAoc3R1Yikge1xuICAgICAgICAgIHN0dWIucmVzZXQoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBub3QgY2FsbCB1bmluc3RhbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICBkZXZpY2VHZXRCdW5kbGVJZHNTdHViLmNhbGxzRmFrZSgoKSA9PiBbXSk7XG5cbiAgICAgIGF3YWl0IHdkYS51bmluc3RhbGwoKTtcbiAgICAgIGRldmljZUdldEJ1bmRsZUlkc1N0dWIuY2FsbGVkT25jZS5zaG91bGQuYmUudHJ1ZTtcbiAgICAgIGRldmljZVJlbW92ZUFwcFN0dWIubm90Q2FsbGVkLnNob3VsZC5iZS50cnVlO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIHVuaW5zdGFsbCBvbmNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgY29uc3QgdW5pbnN0YWxsZWRCdW5kSWRzID0gW107XG4gICAgICBkZXZpY2VHZXRCdW5kbGVJZHNTdHViLmNhbGxzRmFrZSgoKSA9PiBbJ2NvbS5hcHBpdW0uV0RBMSddKTtcbiAgICAgIGRldmljZVJlbW92ZUFwcFN0dWIuY2FsbHNGYWtlKChpZCkgPT4gdW5pbnN0YWxsZWRCdW5kSWRzLnB1c2goaWQpKTtcblxuICAgICAgYXdhaXQgd2RhLnVuaW5zdGFsbCgpO1xuICAgICAgZGV2aWNlR2V0QnVuZGxlSWRzU3R1Yi5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgICAgZGV2aWNlUmVtb3ZlQXBwU3R1Yi5jYWxsZWRPbmNlLnNob3VsZC5iZS50cnVlO1xuICAgICAgdW5pbnN0YWxsZWRCdW5kSWRzLnNob3VsZC5lcWwoWydjb20uYXBwaXVtLldEQTEnXSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgdW5pbnN0YWxsIHR3aWNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgY29uc3QgdW5pbnN0YWxsZWRCdW5kSWRzID0gW107XG4gICAgICBkZXZpY2VHZXRCdW5kbGVJZHNTdHViLmNhbGxzRmFrZSgoKSA9PiBbJ2NvbS5hcHBpdW0uV0RBMScsICdjb20uYXBwaXVtLldEQTInXSk7XG4gICAgICBkZXZpY2VSZW1vdmVBcHBTdHViLmNhbGxzRmFrZSgoaWQpID0+IHVuaW5zdGFsbGVkQnVuZElkcy5wdXNoKGlkKSk7XG5cbiAgICAgIGF3YWl0IHdkYS51bmluc3RhbGwoKTtcbiAgICAgIGRldmljZUdldEJ1bmRsZUlkc1N0dWIuY2FsbGVkT25jZS5zaG91bGQuYmUudHJ1ZTtcbiAgICAgIGRldmljZVJlbW92ZUFwcFN0dWIuY2FsbGVkVHdpY2Uuc2hvdWxkLmJlLnRydWU7XG4gICAgICB1bmluc3RhbGxlZEJ1bmRJZHMuc2hvdWxkLmVxbChbJ2NvbS5hcHBpdW0uV0RBMScsICdjb20uYXBwaXVtLldEQTInXSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNB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
