(function(peerweb) {
    "use strict";
    peerweb.fallback = peerweb.fallback || {};

    peerweb.fallback.Fallback = function(handlers) {

        var fallbackCount = 0;

        /*
         * Returns the proper URL used to request objects as fallback.
         */
        var getFallbackUrl = function(resource) {
            return location.origin + '/resource/' + resource;
        };

        this.fallback = function(resource) {
            fallbackCount += 1;
            $.ajax({
                url:     getFallbackUrl(resource),
                success: function(data) {
                    handlers.onReceive(JSON.parse(data));
                }
            });
        };

        this.getStatistics = function() {
            return {
                'fallbackCount': fallbackCount
            };
        };

        return {
            'fallback':      this.fallback,
            'getStatistics': this.getStatistics
        };

    };

})(window.peerweb = window.peerweb || {});
