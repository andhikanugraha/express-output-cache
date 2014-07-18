var redisClient;

/**
 * Output cache middleware.
 * @param  {integer|object} options TTL in seconds, or options object.
 * @return {callback}       Middleware, usable in Express apps.
 */
function outputCache(options) {
  if (!options) {
    options = {};
  }
  else if (typeof options === 'number') {
    options = { ttl: options };
  }

  options = {
    prefix: options.prefix || 'outputcache',
    ttl: parseInt(options.ttl) || 60,
    getCacheKey: options.getCacheKey || function(req) {
      return options.prefix + req.originalUrl;
    },
    skipCache: options.skipCache || function(req) {
      return true;
    },
    cacheClient:
      options.cacheClient ||
      redisClient ||
      require('redis').createClient(options.redis)
  };

  return function(req, res, next) {
    // Should we check the cache?
    if (!options.skipCache(req)) {
      return;
    }

    // Check cache
    var client = options.cacheClient;
    var cacheKey = options.getCacheKey(req);

    client.get(cacheKey, function(err, data) {
      if (err) {
        return next(err);
      }

      if (data) {
        try {
          var dataObj = JSON.parse(data);
          res.statusCode = dataObj.statusCode;
          res.set(dataObj.headers);
          res.send(dataObj.body);
        }
        catch (e) {
          client.del(cacheKey);
          next();
        }

        return;
      }

      var headers = {};

      var _setHeader = res.setHeader;
      res.setHeader = function(name, value) {
        headers[name] = value;
        _setHeader.call(this, name, value);
      };

      var _send = res.send;
      res.send = function(status, body) {
        if (!body) {
          body = status;
        }
        else if (status >= 400) {
          return _send.apply(this, arguments);
        }

        res.cacheBody = body;
        _send.apply(this, arguments);
      };

      var _end = res.end;
      res.end = function(chunk, encoding) {
        var self = this;
        var args = arguments;
        if (res.statusCode >= 400 || !res.cacheBody) {
          _end.apply(self, args);
          return;
        }

        var cacheObj = {
          headers: headers,
          body: res.cacheBody,
          statusCode: res.statusCode
        };

        client.set(cacheKey, JSON.stringify(cacheObj), function(err) {
          if (err) {
            return;
          }

          client.expire(cacheKey, options.ttl);
        });

        _end.apply(self, args);
      };

      next();
    });
  };
}

module.exports = outputCache;