"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resetTestProcesses = exports.checkForDependencies = exports.bundleWDASim = exports.WebDriverAgent = exports.WDA_RUNNER_BUNDLE_ID = exports.WDA_BUNDLE_ID = exports.WDA_BASE_URL = exports.PROJECT_FILE = exports.NoSessionProxy = exports.BOOTSTRAP_PATH = void 0;

require("source-map-support/register");

var dependencies = _interopRequireWildcard(require("./lib/check-dependencies"));

var proxies = _interopRequireWildcard(require("./lib/no-session-proxy"));

var driver = _interopRequireWildcard(require("./lib/webdriveragent"));

var constants = _interopRequireWildcard(require("./lib/constants"));

var utils = _interopRequireWildcard(require("./lib/utils"));

var _asyncbox = require("asyncbox");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const {
  checkForDependencies,
  bundleWDASim
} = dependencies;
exports.bundleWDASim = bundleWDASim;
exports.checkForDependencies = checkForDependencies;
const {
  NoSessionProxy
} = proxies;
exports.NoSessionProxy = NoSessionProxy;
const {
  WebDriverAgent
} = driver;
exports.WebDriverAgent = WebDriverAgent;
const {
  WDA_BUNDLE_ID,
  BOOTSTRAP_PATH,
  WDA_BASE_URL,
  WDA_RUNNER_BUNDLE_ID,
  PROJECT_FILE
} = constants;
exports.PROJECT_FILE = PROJECT_FILE;
exports.WDA_RUNNER_BUNDLE_ID = WDA_RUNNER_BUNDLE_ID;
exports.WDA_BASE_URL = WDA_BASE_URL;
exports.BOOTSTRAP_PATH = BOOTSTRAP_PATH;
exports.WDA_BUNDLE_ID = WDA_BUNDLE_ID;
const {
  resetTestProcesses
} = utils;
exports.resetTestProcesses = resetTestProcesses;

if (require.main === module) {
  (0, _asyncbox.asyncify)(checkForDependencies);
}require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJuYW1lcyI6WyJjaGVja0ZvckRlcGVuZGVuY2llcyIsImJ1bmRsZVdEQVNpbSIsImRlcGVuZGVuY2llcyIsIk5vU2Vzc2lvblByb3h5IiwicHJveGllcyIsIldlYkRyaXZlckFnZW50IiwiZHJpdmVyIiwiV0RBX0JVTkRMRV9JRCIsIkJPT1RTVFJBUF9QQVRIIiwiV0RBX0JBU0VfVVJMIiwiV0RBX1JVTk5FUl9CVU5ETEVfSUQiLCJQUk9KRUNUX0ZJTEUiLCJjb25zdGFudHMiLCJyZXNldFRlc3RQcm9jZXNzZXMiLCJ1dGlscyIsInJlcXVpcmUiLCJtYWluIiwibW9kdWxlIiwiYXN5bmNpZnkiXSwic291cmNlUm9vdCI6Ii4uIiwic291cmNlcyI6WyJpbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkZXBlbmRlbmNpZXMgZnJvbSAnLi9saWIvY2hlY2stZGVwZW5kZW5jaWVzJztcbmltcG9ydCAqIGFzIHByb3hpZXMgZnJvbSAnLi9saWIvbm8tc2Vzc2lvbi1wcm94eSc7XG5pbXBvcnQgKiBhcyBkcml2ZXIgZnJvbSAnLi9saWIvd2ViZHJpdmVyYWdlbnQnO1xuaW1wb3J0ICogYXMgY29uc3RhbnRzIGZyb20gJy4vbGliL2NvbnN0YW50cyc7XG5pbXBvcnQgKiBhcyB1dGlscyBmcm9tICcuL2xpYi91dGlscyc7XG5pbXBvcnQgeyBhc3luY2lmeSB9IGZyb20gJ2FzeW5jYm94JztcblxuXG5jb25zdCB7IGNoZWNrRm9yRGVwZW5kZW5jaWVzLCBidW5kbGVXREFTaW0gfSA9IGRlcGVuZGVuY2llcztcbmNvbnN0IHsgTm9TZXNzaW9uUHJveHkgfSA9IHByb3hpZXM7XG5jb25zdCB7IFdlYkRyaXZlckFnZW50IH0gPSBkcml2ZXI7XG5jb25zdCB7IFdEQV9CVU5ETEVfSUQsIEJPT1RTVFJBUF9QQVRILCBXREFfQkFTRV9VUkwsIFdEQV9SVU5ORVJfQlVORExFX0lELCBQUk9KRUNUX0ZJTEUgfSA9IGNvbnN0YW50cztcbmNvbnN0IHsgcmVzZXRUZXN0UHJvY2Vzc2VzIH0gPSB1dGlscztcblxuXG4vLyBXaGVuIHJ1biBhcyBhIGNvbW1hbmQgbGluZSB1dGlsaXR5LCB0aGlzIHNob3VsZCBjaGVjayBmb3IgdGhlIGRlcGVuZGVuY2llc1xuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGFzeW5jaWZ5KGNoZWNrRm9yRGVwZW5kZW5jaWVzKTtcbn1cblxuZXhwb3J0IHtcbiAgV2ViRHJpdmVyQWdlbnQsXG4gIE5vU2Vzc2lvblByb3h5LFxuICBjaGVja0ZvckRlcGVuZGVuY2llcywgYnVuZGxlV0RBU2ltLFxuICByZXNldFRlc3RQcm9jZXNzZXMsXG4gIEJPT1RTVFJBUF9QQVRILCBXREFfQlVORExFX0lELFxuICBXREFfUlVOTkVSX0JVTkRMRV9JRCwgUFJPSkVDVF9GSUxFLFxuICBXREFfQkFTRV9VUkwsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBR0EsTUFBTTtFQUFFQSxvQkFBRjtFQUF3QkM7QUFBeEIsSUFBeUNDLFlBQS9DOzs7QUFDQSxNQUFNO0VBQUVDO0FBQUYsSUFBcUJDLE9BQTNCOztBQUNBLE1BQU07RUFBRUM7QUFBRixJQUFxQkMsTUFBM0I7O0FBQ0EsTUFBTTtFQUFFQyxhQUFGO0VBQWlCQyxjQUFqQjtFQUFpQ0MsWUFBakM7RUFBK0NDLG9CQUEvQztFQUFxRUM7QUFBckUsSUFBc0ZDLFNBQTVGOzs7Ozs7QUFDQSxNQUFNO0VBQUVDO0FBQUYsSUFBeUJDLEtBQS9COzs7QUFJQSxJQUFJQyxPQUFPLENBQUNDLElBQVIsS0FBaUJDLE1BQXJCLEVBQTZCO0VBQzNCLElBQUFDLGtCQUFBLEVBQVNsQixvQkFBVDtBQUNEIn0=
