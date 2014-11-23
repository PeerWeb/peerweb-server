(function(peerweb) {
    "use strict";
    peerweb.statistics = peerweb.statistics || {};

    peerweb.statistics.StatisticsCollector = function() {

        /**
         * Pseudorandom ID used to correlate statistics in the collector.
         */
        var id = Math.floor(Math.random() * 10000);

        /*
         * Returns the proper URL used to request objects as fallback.
         */
        var getCollectorUrl = function() {
            return 'http://' + serverName + ':3001/';
        };

        this.submit = function(statistics) {

            var additionalData = {
                'id':    id,
                'path':  window.location.pathname.substring(1),
                'extra': window.location.hash.substring(1)      // e.g., an ID supplied by Selenium
            };

            $.ajax({
                type: 'POST',
                url:  getCollectorUrl(),
                data: _.extend(additionalData, statistics)
            });
        };

    };
})(window.peerweb = window.peerweb || {});
