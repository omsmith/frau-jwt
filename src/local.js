'use strict';

var Promise = require('lie'),
	request = require('superagent'),
	xsrfToken = require('frau-superagent-xsrf-token');

var DEFAULT_SCOPE = '*:*:*',
	TOKEN_ROUTE = '/d2l/lp/auth/oauth2/token';

var CACHED_TOKENS = {},
	IN_FLIGHT_REQUESTS = {};

function clock () {
	return (Date.now() / 1000) | 0;
}

function expired (token) {
	return module.exports._clock() > token.expires_at;
}

function cacheToken (scope, token) {
	CACHED_TOKENS[scope] = token;
}

function cachedToken (scope) {
	return Promise
		.resolve()
		.then(function () {
			var cached = CACHED_TOKENS[scope];
			if (cached) {
				if (!expired(cached)) {
					return cached.access_token;
				}

				delete CACHED_TOKENS[scope];
			}

			throw new Error('No cached token');
		});
}

function requestToken (scope) {
	return new Promise(function (resolve, reject) {
		request
			.post(TOKEN_ROUTE)
			.type('form')
			.send({
				scope: scope
			})
			.use(xsrfToken)
			.end(function (err, res) {
				if (err) {
					return reject(err);
				}

				resolve(res.body);
			});
	});
}

function requestTokenDeduped (scope) {
	if (!IN_FLIGHT_REQUESTS[scope]) {
		IN_FLIGHT_REQUESTS[scope] = requestToken(scope)
			.then(function (token) {
				delete IN_FLIGHT_REQUESTS[scope];
				return token;
			})
			.catch(function (e) {
				delete IN_FLIGHT_REQUESTS[scope];
				throw e;
			});
	}

	return IN_FLIGHT_REQUESTS[scope];
}

module.exports = function getLocalJwt (scope) {
	return Promise
		.resolve()
		.then(function () {
			scope = scope || DEFAULT_SCOPE;

			var cached = cachedToken.bind(null, scope);

			return cached()
				.catch(function () {
					return requestTokenDeduped(scope)
						.then(cacheToken.bind(null, scope))
						.then(cached);
				});
		});
};

module.exports._clock = clock;
module.exports._resetCaches = function () {
	CACHED_TOKENS = {};
	IN_FLIGHT_REQUESTS = {};
};
