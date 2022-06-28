"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.NoSessionProxy = void 0;

require("source-map-support/register");

var _appiumBaseDriver = require("appium-base-driver");

class NoSessionProxy extends _appiumBaseDriver.JWProxy {
  constructor(opts = {}) {
    super(opts);
  }

  getUrlForProxy(url) {
    if (url === '') {
      url = '/';
    }

    const proxyBase = `${this.scheme}://${this.server}:${this.port}${this.base}`;
    let remainingUrl = '';

    if (new RegExp('^/').test(url)) {
      remainingUrl = url;
    } else {
      throw new Error(`Did not know what to do with url '${url}'`);
    }

    remainingUrl = remainingUrl.replace(/\/$/, '');
    return proxyBase + remainingUrl;
  }

}

exports.NoSessionProxy = NoSessionProxy;
var _default = NoSessionProxy;
exports.default = _default;require('source-map-support').install();


//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliL25vLXNlc3Npb24tcHJveHkuanMiLCJuYW1lcyI6WyJOb1Nlc3Npb25Qcm94eSIsIkpXUHJveHkiLCJjb25zdHJ1Y3RvciIsIm9wdHMiLCJnZXRVcmxGb3JQcm94eSIsInVybCIsInByb3h5QmFzZSIsInNjaGVtZSIsInNlcnZlciIsInBvcnQiLCJiYXNlIiwicmVtYWluaW5nVXJsIiwiUmVnRXhwIiwidGVzdCIsIkVycm9yIiwicmVwbGFjZSJdLCJzb3VyY2VSb290IjoiLi4vLi4iLCJzb3VyY2VzIjpbImxpYi9uby1zZXNzaW9uLXByb3h5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEpXUHJveHkgfSBmcm9tICdhcHBpdW0tYmFzZS1kcml2ZXInO1xuXG5cbmNsYXNzIE5vU2Vzc2lvblByb3h5IGV4dGVuZHMgSldQcm94eSB7XG4gIGNvbnN0cnVjdG9yIChvcHRzID0ge30pIHtcbiAgICBzdXBlcihvcHRzKTtcbiAgfVxuXG4gIGdldFVybEZvclByb3h5ICh1cmwpIHtcbiAgICBpZiAodXJsID09PSAnJykge1xuICAgICAgdXJsID0gJy8nO1xuICAgIH1cbiAgICBjb25zdCBwcm94eUJhc2UgPSBgJHt0aGlzLnNjaGVtZX06Ly8ke3RoaXMuc2VydmVyfToke3RoaXMucG9ydH0ke3RoaXMuYmFzZX1gO1xuICAgIGxldCByZW1haW5pbmdVcmwgPSAnJztcbiAgICBpZiAoKG5ldyBSZWdFeHAoJ14vJykpLnRlc3QodXJsKSkge1xuICAgICAgcmVtYWluaW5nVXJsID0gdXJsO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYERpZCBub3Qga25vdyB3aGF0IHRvIGRvIHdpdGggdXJsICcke3VybH0nYCk7XG4gICAgfVxuICAgIHJlbWFpbmluZ1VybCA9IHJlbWFpbmluZ1VybC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyBjYW4ndCBoYXZlIHRyYWlsaW5nIHNsYXNoZXNcbiAgICByZXR1cm4gcHJveHlCYXNlICsgcmVtYWluaW5nVXJsO1xuICB9XG59XG5cbmV4cG9ydCB7IE5vU2Vzc2lvblByb3h5IH07XG5leHBvcnQgZGVmYXVsdCBOb1Nlc3Npb25Qcm94eTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUE7O0FBR0EsTUFBTUEsY0FBTixTQUE2QkMseUJBQTdCLENBQXFDO0VBQ25DQyxXQUFXLENBQUVDLElBQUksR0FBRyxFQUFULEVBQWE7SUFDdEIsTUFBTUEsSUFBTjtFQUNEOztFQUVEQyxjQUFjLENBQUVDLEdBQUYsRUFBTztJQUNuQixJQUFJQSxHQUFHLEtBQUssRUFBWixFQUFnQjtNQUNkQSxHQUFHLEdBQUcsR0FBTjtJQUNEOztJQUNELE1BQU1DLFNBQVMsR0FBSSxHQUFFLEtBQUtDLE1BQU8sTUFBSyxLQUFLQyxNQUFPLElBQUcsS0FBS0MsSUFBSyxHQUFFLEtBQUtDLElBQUssRUFBM0U7SUFDQSxJQUFJQyxZQUFZLEdBQUcsRUFBbkI7O0lBQ0EsSUFBSyxJQUFJQyxNQUFKLENBQVcsSUFBWCxDQUFELENBQW1CQyxJQUFuQixDQUF3QlIsR0FBeEIsQ0FBSixFQUFrQztNQUNoQ00sWUFBWSxHQUFHTixHQUFmO0lBQ0QsQ0FGRCxNQUVPO01BQ0wsTUFBTSxJQUFJUyxLQUFKLENBQVcscUNBQW9DVCxHQUFJLEdBQW5ELENBQU47SUFDRDs7SUFDRE0sWUFBWSxHQUFHQSxZQUFZLENBQUNJLE9BQWIsQ0FBcUIsS0FBckIsRUFBNEIsRUFBNUIsQ0FBZjtJQUNBLE9BQU9ULFNBQVMsR0FBR0ssWUFBbkI7RUFDRDs7QUFsQmtDOzs7ZUFzQnRCWCxjIn0=
