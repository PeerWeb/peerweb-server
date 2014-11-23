/*
 * `peerweb-content.js` -> peerweb.PeerWeb
 *
 *   This script contains the "heart" of PeerWeb content loading
 *   support. Depends on the various other PeerWeb client-side
 *   components.
 *
 */
(function(peerweb) { // namespace technique from
    "use strict";

    peerweb.PeerWeb = function() {

        /*
         * Use a two-level cache. To support P2P sharing of large data
         * items such as videos, data is kept in a JavaScript-based cache
         * first. To accommodate persistence of data across pages, increasing
         * load times for the local client and the general availability of
         * data in the network, data is secondly cached in the (space-
         * constrained) `localStorage`.
         */
        var cache = new peerweb.cache.Cache([
            new peerweb.cache.JavaScriptCache(),
            new peerweb.cache.StorageCache(localStorage, peerweb.cache.StorageCache.policy.LruSample)
        ]);

        /*
         * We use a client-side collector to gather detailed load-time
         * statistics.
         */
        var stats = new peerweb.statistics.StatisticsCollector();

        /*
         * Because a true test of PeerWeb involves loading a large number of
         * clients, we make use of the Selenium testing framework to open
         * Google Chrome (or Chromium) instances on a large scale. A client-side
         * component allows us to "inform" the Selenium testing framework when
         * certain events have occurred.
         */
        var selenium = new peerweb.selenium.Selenium();

        /*
         * Flag allowing us to enable or disable statistics collection.
         */
        var COLLECT_STATISTICS = true;

        /*
         * Set to `true` when all objects on the page have been requested.
         * This allows us to determine whether we have loaded all objects
         * that are on the page when the request queue has been emptied
         * (it is possible that some have simply not yet been requested).
         * This information is used for statistics collection.
         */
        var allLoadsRequested = false;

        /*
         * Time (in ms) after which to reissue a request if it has not yet been
         * serviced.
         */
        var REQUEST_REISSUE_TIMEOUT = 3000;

        /*
         * Time (in ms) after which a request should be reissued if peers change.
         * That is, when peers change, any request that has not been answered in
         * this amount of time will be reissued. The networking component should
         * distribute the request to a set of peers, which might (and likely will)
         * differ from those to which the request was sent before.
         */
        var REQUEST_ONPEERCHANGE_TIMEOUT = 1500;

        /*
         * Time (in ms) to wait before requesting data from the fallback source
         * if no peers are established.
         */
        var REQUEST_NOPEERS_TIMEOUT = 3000;

        /*
         * Number of reissues after which the fallback mechanism is used. That is,
         * if this number is X, then on the Xth reissue (the X+1st issue) of the
         * request, it is sent to the reliable fallback mechanism rather than
         * peers.
         */
        var REQUEST_REISSUE_BEFORE_FALLBACK = 3;

        /*
         * Indicates whether `onPeerChange` has been called at least once. Until
         * that has occurred, we know that there are no peers. As such, we queue
         * all requests wihout submitting them until that has occurred.
         */
        var possiblyHasPeers = false;

        /*
         * Collection of requests. This will be treated like a java.util.HashSet,
         * with the keys (object fields) as the resources. We'll just stick `null`
         * in the value... at first. Then it becomes like a HashMap.
         *
         * `null` signifies that we've never issued the request. But once we have,
         * we'll use the value to keep track of the last time we requested the
         * resource. This is so that we can keep track of whether we should re-issue
         * a request when the set of peers has changed.
         */
        var requests = {};

        /*
         * Map managing all DOM objects that are to be loaded via PeerWeb.
         * Key is the `id` of the DOM element; value is an object containing
         * the DOM `id` (same as the key), the list of resources covering all
         * data for the object, and an array containing the resources required
         * for an object that have not yet been fetched.
         *
         *     domId: {
         *         'id': domId,
         *         'resources': [
         *             ...,
         *             ...
         *         ],
         *         'remaining': [
         *             ...,
         *             ...
         *         ]
         *     }
         */
        var requestedObjects = {};

        /*
         * Function, supplied by the networking component, that is used
         * issue a request for data.
         */
        var requestData;

        /*
         * Function, supplied by the networking component, that is used to get
         * statistics for reporting to the collector.
         */
        var getNetworkStatistics;

        /*
         * Converts a string of data into its "resource" identifier (which
         * is simply its SHA-1 hash).
         */
        var toResource = function(data) {
            return new jsSHA(data, 'TEXT').getHash('SHA-1', 'HEX');
        };

        /*
         * Statistics derived from content managment. Tallied while content is
         * being handled and sent to the statistics collector in the end.
         */
        var statistics = {
            'requestedCount':    0,
            'cachedCount':       0,
            'requestsSatisfied': 0,
            'startTime':         _.now()
        };

        var loadRequestor = function(requestor) {

            var element = document.getElementById(requestor.domId);

            // reconstruct data (all will be in cache if this is called)
            var data = '';
            for (var index = 0; index < requestor.resources.length; index++) {
                //console.log('GOING TO GET FROM THE CACHE', requestor.resources[index]);
                var fromCache = cache.get(requestor.resources[index]);
                //console.log('FROM THE CACHE', fromCache);
                data += fromCache;
            }

            //console.log('TO BE PARSED', data);
            var objData = JSON.parse(data);

            if (element.tagName == 'CANVAS') {
                element.width = objData.width;
                element.height = objData.height;

                // http://www.html5canvastutorials.com/advanced/html5-canvas-load-image-data-url/
                // http://diveintohtml5.info/canvas.html
                // http://www.html5canvastutorials.com/tutorials/html5-canvas-image-size/
                var img = new Image();
                img.onload = function() { // only when the data has been loaded can the image be drawn
                    element.getContext('2d').drawImage(img, 0, 0);
                };
                img.src = objData.image;
            } else if (element.tagName == 'DIV' || element.tagName == 'P') {
                element.innerHTML = objData.html;
            } else {
                throw "Tag " + element.tagName + " not supported for PeerWeb loads";
            }

            delete requestedObjects[requestor.domId];
        };

        var endContent = function() {

            if (!(allLoadsRequested && Object.keys(requests).length == 0)) {
                return;
            }

            if (COLLECT_STATISTICS) {
                var report = new Array();

                // network statistics
                {
                    var pairs = _.pairs(getNetworkStatistics());
                    pairs = _.map(pairs, function(pair) { return ['net.' + pair[0], pair[1]]; });
                    report = getNetworkStatistics ? _.union(report, pairs) : report;
                }

                // fallback statistics
                {
                    var pairs = _.pairs(getFallbackStatistics());
                    pairs = _.map(pairs, function(pair) { return ['fallback.' + pair[0], pair[1]]; });
                    report = getFallbackStatistics ? _.union(report, pairs) : report;
                }

                // content statistics
                {
                    statistics['endTime'] = _.now();
                    statistics['loadTime'] = statistics['endTime'] - statistics['startTime'];

                    var pairs = _.pairs(statistics);
                    pairs = _.map(pairs, function(pair) { return ['content.' + pair[0], pair[1]]; });
                    report = _.union(report, pairs);
                }

                report = _.object(report);

                // easiest just to derive this
                report['content.peerLoadCount'] =   report['content.requestsSatisfied']
                                                  - report['fallback.fallbackCount']
                                                  - report['content.cachedCount'];


                stats.submit(report);
            }

            selenium.pageComplete();
        }

        /*
         * Fills DOM objects with the appropriate data.
         */
        var showResource = function(resource) {

            //console.log('time to show a resource!0', resource);

            var requestors = requests[resource].requestors;

            for (var index = 0; index < requestors.length; index++) {

                //console.log('REQUESTOR INDEX IS', index);
                var requestor = requestors[index];
                //console.log('REQUESTOR IS', requestor);
                //console.log('REMAINING?', requestor['remaining']);

                delete requestor['remaining'][resource];

                //console.log('REMAINING?', requestor['remaining']);
                if (Object.keys(requestor['remaining']).length == 0) {
                    loadRequestor(requestor);
                }

            }

            statistics['requestsSatisfied'] = statistics['requestsSatisfied'] + 1;
            delete requests[resource];

            // collect statistics if desired
            endContent();
        };

        /*
         * What to do when data has been received. Load it into the DOM, if it is
         * a good response.
         *
         * If we receive multiple responses for the same object, then the first good
         * response is used, and subsequent respones are ignored.
         */
        var onReceive = function(response) {
            //console.log('RESPONSE DATA', response.data);
            var resource = toResource(response.data);

            //console.log('THE RESOURCE IS', resource);

            // if the data we've received doesn't pass the checksum check, then
            // it's bad; the request will be submitted again naturally, or we'll get
            // an additional (possibly good) response from another peer
            if (resource != response.resource) {
                console.error('BAD', response.resource, resource);
                return;
            }

            // only continue if there's still a pending request for this data
            if (requests[response.resource]) {
                clearTimeout(requests[response.resource].timeoutHandle);
            } else { // if this is executing multiple times at once, then the object
                     // will be re-cached and `showResource` will be called again, but
                     // that should not cause any issues
                //console.log('UNNECESSARY', response.resource);
                return;
            }

            // a good result should be cached and used
            cache.add(response);
            //console.log('CACHED', response.resource);
            showResource(response.resource);
        };

        /*
         * What to do when data is requested. Grab it from the cache, if available.
         * Returns `null` if the requested resource is not available.
         */
        var onRequest = function(resource) {
            //console.log('REQUESTED', resource);
            var data = cache.get(resource);
            return data == null ? null : {
                'resource': resource,
                'data':     data
            };
        };

        /*
         * Gets a resource... or queues the request in the absence of peers.
         *
         * If there might be peers, then the resource is requested now; otherwise,
         * the request is pushed into the queue, where it will be processed again
         * when `onPeerChange` is finally called.
         *
         * Note that today's browsers will render some page elements before the
         * entire HTML page has been processed [1]. As such, we can load some data
         * pulled from peers before others.
         *
         * [1]: http://www.html5rocks.com/en/tutorials/internals/howbrowserswork/
         */
        var get = function(resource) {
            //console.log('GET', resource);

            // at this point, other methods have already handled adding a request
            // for the object

            // hopefully it's already cached
            var cached = cache.get(resource);
            if (cached) {
                //console.log('HAS', resource);
                statistics['cachedCount']  = statistics['cachedCount'] + 1;
                showResource(resource);
                return;
            }

            var request = requests[resource];

            // if there might be peers, then we should request it
            if (possiblyHasPeers) {
                //console.log('ASK', resource);

                clearTimeout(request.timeoutHandle);
                request.reissues = (request.reissues != undefined) ? request.reissues + 1 : 0;
                request.requestTime = _.now();

                if (request.reissues <= REQUEST_REISSUE_BEFORE_FALLBACK) {

                    var getAgain = function() {
                        get(resource);
                    };
                    request.timeoutHandle = setTimeout(getAgain, REQUEST_REISSUE_TIMEOUT);

                    requestData(resource);

                } else if (!request.fallback) {
                    //console.log('FALLING BACK', resource);
                    request.timeoutHandle = null;
                    fallback(resource);
                    request.fallback = true;
                }

            // will need to come in with fallback eventually
            } else {
                if (!request.requestTime) {
                    var doFallback = function() {
                        if (!request.fallback) {
                            request.requestTime = _.now();
                            request.timeoutHandle = null;
                            //console.log('FALLING BACK', resource);
                            fallback(resource);
                            request.fallback = true;
                        }
                    };
                    request.timeoutHandle = setTimeout(doFallback, REQUEST_NOPEERS_TIMEOUT);
                }

            }

        };

        /*
         * Used within the page HTML to "load" a resource into a particular
         * DOM element.
         *
         * Marks the DOM element and attempts to fulfill the request.
         */
        this.load = function(request) {

            var remaining = {};
            for (var resource in request.resources) {
                remaining[request.resources[resource]] = null;
            }

            var requestedObject = {
                'domId': request.into,
                'resources': request.resources,
                'remaining': remaining
            };

            requestedObjects[request.into] = requestedObject;

            for (var index = 0; index < request.resources.length; index++) {
                //console.log('GONNA PASS', requestedObject);

                var resource = request.resources[index];

                var requestors;
                if (requests[resource]) {
                    //console.log('QUEUED', resource);
                    requestors = requests[resource].requestors;
                    requestors.push(requestedObject);
                    requests[resource]['requestors'] = requestors;
                } else {
                    //console.log('QUEUE', resource);
                    requestors = new Array();
                    requestors.push(requestedObject);
                    requests[resource] = {
                        'requestors': requestors
                    };
                    statistics['requestedCount'] = statistics['requestedCount'] + 1;
                }

                get(resource);
            }

        };

        /**
         * Signals that the page will perform no additional PeerWeb loads.
         * This is only necessary so that we can determine when to log a
         * statistic indicating that the entire page has been loaded. In
         * a real-world deployment, this would not be necessary, thereby
         * allowing a page to load additional data (e.g., on a more dynamic
         * page) by calling PeerWeb load calls directly.
         */
        this.done = function() {
            allLoadsRequested = true;
            endContent();
        };

        /*
         * It will be necessary to fall back to the resource server if a
         * data item cannot be obtained from the preferred P2P channels.
         */
        var fallback;
        var getFallbackStatistics;
        {
            var callbacks = new peerweb.fallback.Fallback({
                'onReceive': onReceive
            });
            fallback = callbacks['fallback'];
            getFallbackStatistics = callbacks['getStatistics'];
        };

        /*
         * What to do when peers have been added or removed.
         */
        var onPeerChange = function() {
            possiblyHasPeers = true; // only after this called do we possibly have peers

            // service any requests that have not been requested or that haven't
            // been serviced within a particular amount of time (it's worth trying
            // again)
            var now = _.now();

            var randomizedRequests = _.shuffle(Object.keys(requests));

            for (var index = 0; index < randomizedRequests.length; index++) {
                var resource = randomizedRequests[index];
                if (!requests[resource].requestTime
                        || (now - requests[resource].requestTime) > REQUEST_ONPEERCHANGE_TIMEOUT) {
                    get(resource);
                }
            }
        };

        /*
         * Initialize the (P2P) networking component.
         */
        {
            var callbacks = peerweb.net.contentStart({
                'onPeerChange': onPeerChange,
                'onReceive':    onReceive,
                'onRequest':    onRequest
            });
            requestData = callbacks['requestData'];
            getNetworkStatistics = callbacks['getStatistics'];
        }

    };

})(
    window.peerweb = window.peerweb || {}
);

