/*
 * `peerweb-selenium.js` -> peerweb.selenium.Selenium
 *
 *   Provides functionality to aid in testing PeerWeb using a
 *   Selenium-orchestrated test. The Selenium API does not allow
 *   for clean conditions checking that would be idea here. In
 *   particular, a human viewing a page loaded using PeerWeb
 *   might notice that a page has loaded completely, but due to
 *   the deferred loads, such a feat is not easy to automate in
 *   Selenium.
 *
 */
(function(peerweb) {
    "use strict";
    peerweb.selenium = peerweb.selenium || {};

    peerweb.selenium.Selenium = function() {

        /**
         * Should be called when all PeerWeb-loaded objects on the page
         * have been loaded. Used to signal to Selenium that the loads
         * are complete.
         */
        this.pageComplete = function() {

            // signal takes the form of a new (hidden) DOM element that
            // Selenium can wait for

            var completeDomElement = document.createElement('div');
            completeDomElement.id = 'peerweb_page_complete';
            completeDomElement.style['display'] = 'none';
            document.body.appendChild(completeDomElement);
        };

    };
})(window.peerweb = window.peerweb || {});
