/**
 * Primary cache interface used in PeerWeb content handling. Allows the use of
 * multiple cache types (e.g., levels of permanence), each with their own
 * ruleset.
 *
 * Caches are specified at initialization time. When an object is cached, it is
 * submitted to each of the caches in order. When an object is requested, the
 * caches are searched in order. In the latter circumstance, each cache is
 * consulted so that any caches that need to manage metadata (e.g., number of
 * times an object has been requested) can do so. This does increase the cost
 * of a get operation, but it allows for truer (e.g.) LRU.
 */
(function(peerweb) {
    "use strict";
    peerweb.cache = peerweb.cache || {};
    peerweb.cache.Cache = function(cacheArray) {
        var caches = cacheArray;

        this.add = function(object) {
            caches.forEach(function(cache) {
                cache.add(object);
            });
        };

        this.get = function(resource) {
            var result = undefined;
            caches.forEach(function(cache) {
                var cached = cache.get(resource);
                if (cached && result == undefined) {
                    result = cached;
                }
            });
            return result;
        };

    };
})(window.peerweb = window.peerweb || {});

