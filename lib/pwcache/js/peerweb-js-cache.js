/**
 * `peerweb-js-cache`
 *
 * JavaScript-based cache. Designed to hold _all_ data from the page currently
 * being viewed. This allows access to _all_ data being viewed to be served to
 * other peers -- at the cost of memory usage on the client.
 *
 * This possibly poses an advantage over higher-permanence stores like
 * `localStorage` due to the size constraints placed on those mechanisms. For
 * example, if streaming a 15 MB video via PeerWeb, only 5 MB of video chunks
 * could be maintained in `localStorage` alone, meaning that this peer could
 * only serve at most 1/3 of the total video.
 *
 * But an alternative idea is to store all that we can _now_ and keep as much as
 * we can for later. In other words, store data in memory while visiting a page
 *
 * Truthfully, if streaming, say, a 3 GB movie, allowing all of that data to be
 * stored in memory would not be ideal. This trivial implementation simply
 * stores all data without regard to size.
 */
(function(peerweb) {
    "use strict";
    peerweb.cache = peerweb.cache || {};

    peerweb.cache.JavaScriptCache = function() {

        var cache = {};

        this.add = function(object) {
            cache[object.resource] = object.data;
        };

        this.get = function(resource) {
            return cache[resource];
        };

    };
})(window.peerweb = window.peerweb || {});

