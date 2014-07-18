var events = require('events');
var util = require('util');

var cacheEvents = new events.EventEmitter();
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
    cacheKey: (typeof options.cacheKey === 'function') ?
      options.cacheKey :
      function(req) {
        return options.prefix + req.originalUrl;
      },
    skipCache: options.skipCache || false,
    cacheClient: options.cacheClient || redisClient
  };

  if (!options.cacheClient ||
      !options.cacheClient.get ||
      !options.cacheClient.set ||
      !options.cacheClient.expire) {
    cacheEvents.emit('warning',
      new Error('Invalid cacheClient value. Reverting to redis.'));
    options.cacheClient =
      redisClient = require('redis').createClient(options.redis);
  }

  var skipFunction = (typeof options.skipCache === 'function');

  return function(req, res, next) {
    // Should we check the cache?
    if (options.skipCache === true ||
        (skipFunction && options.skipCache(req))) {
      cacheEvents.emit('skip', req);
      return;
    }

    // Check cache
    var client = options.cacheClient;
    var cacheKey = options.cacheKey(req);

    client.get(cacheKey, function(err, data) {
      if (err) {
        return next(err);
      }

      if (data) {
        try {
          cacheEvents.emit('hit', cacheKey, req);
          var dataObj = JSON.parse(data);
          res.statusCode = dataObj.statusCode;
          res.set(dataObj.headers);
          res.send(dataObj.body);
        }
        catch (e) {
          cacheEvents.emit('warning', e);
          cacheEvents.emit('delete', cacheKey);
          client.del(cacheKey);
          next();
        }

        return;
      }

      cacheEvents.emit('miss', cacheKey, req);

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
            cacheEvents.emit('cacheError', err);
            return;
          }

          client.expire(cacheKey, options.ttl, function(err) {
            if (err) {
              cacheEvents.emit('cacheError', err);
              return;
            }

            cacheEvents.emit('save', cacheKey, cacheObj);
          });
        });

        _end.apply(self, args);
      };

      next();
    });
  };
}

outputCache.events = cacheEvents;
for (var method in cacheEvents) {
  var value = cacheEvents[method];
  if (typeof value === 'function') {
    outputCache[method] = value.bind(cacheEvents);
  }
  else {
    outputCache[method] = value;
  }
}

module.exports = outputCache;