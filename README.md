express-output-cache
====================

This middleware caches the output (headers and body) of an Express request using Redis. Only string-based responses sent using `res.send()` (including `res.render()`) with `statusCode` < 400 are cached.

### Installation

	npm i express-output-cache

### Basic usage

	var outputCache = require('express-output-cache');
	// Cache the response for this request for 1 hour (default is 60 seconds)
	app.get('/page-with-long-processing', outputCache(3600), handler);

### outputCache(options)

Options can be the TTL for cache entries in seconds or an object with the following keys:

 * `prefix`: Prefix to use inside Redis/cache. (default: `'outputcache'`)
 * `ttl`: The TTL as an integer. (default: 60)
 * `cacheKey`: Callback to generate the cache key for each entry. (default: `options.prefix + ':' + req.originalUrl`)
 * `skipCache`: Either boolean `true` to skip the cache for all requests or a callback which will be passed Express' `req` as its only argument.
 * `cacheClient`: Cache client; can be redis or any object that supports `get()`, `set()` and `expire()` like redis. (default: create a new Redis client)

### License

 MIT