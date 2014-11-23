/**
 * `peerweb-storage-cache`
 */
(function(peerweb) {
    "use strict";
    peerweb.cache = peerweb.cache || {};

    peerweb.cache.StorageCache = function(aStorage, aPolicy) {
        var storage = aStorage;

        var setPolicyInfo = function(resource, policyInfo) {
            storage.setItem('_' + resource, policyInfo);
        }
        var getPolicyInfo = function(resource) {
            return storage.getItem('_' + resource);
        }
        var removePolicyInfo = function(resource) {
            return storage.removeItem('_' + resource);
        }

        var policy = new aPolicy(getPolicyInfo, setPolicyInfo, removePolicyInfo);

        // (1) put array in storage
        // (2) and only array

        // inspired by https://github.com/monsur/jscache/blob/master/cache.js
        //   and locache.js

        // there are some existing LRU caches in JS
        //   https://github.com/rsms/js-lru

        ////////////////////////////////////////////////////////////////////////////
        //
        // Inspired by
        //   https://github.com/monsur/jscache/blob/master/cache.js
        //
        ////////////////////////////////////////////////////////////////////////////

        // some good information on cache eviction algorithms:
        //   http://ehcache.org/documentation/apis/cache-eviction-algorithms
        //  * basically we follow the same extensible model as EHCache in the filter design
        //  * note that EHCache's `Policy` interface specifies in documentation that usually
        //    the item being added should never be the victim; we follow, that, too -- though
        //    it makes sense more for some policies (LRU) than for others (MINS) -- and this
        //    makes the implementation simpler.

        // there is an assumption that the thing being added to the cache _must_ be cached.
        // that is, we never choose to keep everything else and ignore it

        // recover items already in the persisted storage cache (exclude policy data)
        var resources = _.reject(Object.keys(storage), function(key) { return key.indexOf('_') == 0; });
        resources = _.object(resources, resources); // places same value as key and value; makes deletion easy

        // there is a case in which the data is stored using one policy and is now being handled by a
        // different policy; this is not handled but could be by storing in the cache something that
        // indicates the policy in use

        /*
         * Add an item to the cache.
         */
        this.add = function(object) {

            // attempt to store

            while (true) {
                try {

                    var previouslyCached = resources[object.resource];
                    if (previouslyCached) {
                        policy.recordPolicyInfo(object.resource, previouslyCached);
                        return;
                    }

                    policy.recordPolicyInfo(object.resource, object.data);

                    storage.setItem(object.resource, object.data);
                    resources[object.resource] = object.resource;

                } catch (e) {
                    removePolicyInfo(object.resource); // clean up (will set again)
                    if (e.name == 'QuotaExceededError') {
                        var victim = policy.chooseVictim(Object.keys(resources));
                        //console.log('===> VICTIM is ' + victim);
                        removePolicyInfo(victim);
                        storage.removeItem(victim);
                        delete resources[victim];

                        // stop trying if the new object was chosen as the victim (not caching it)
                        if (victim == object.resource) {
                            return;
                        }

                        continue;
                    } else {
                        throw e;
                    }
                }
                break;
                //console.log('looping again');
            }
        };

        /*
         * Obtains an item from the cache. Updates the cache eviction policy metadata.
         */
        this.get = function(resource) {
            var cached = storage.getItem(resource);
            if (cached) {
                try {
                    policy.recordPolicyInfo(resource, cached);
                } catch (e) {
                    if (e.name == 'QuotaExceededError') {
                        /*
                         * If we can't update the policy metdata because doing
                         * so fills the cache past what the browser allows
                         * (unlikely), then we just ignore the failure. The old
                         * metadata should still be in place, and the item will
                         * either (a) eventually be evicted or (b) have its
                         * metadata updated the next time it is re-cached.
                         *
                         */
                    } else {
                        throw e;
                    }
                }
            }
            return cached;
        };

    };

    // todo: document why we store metadata separately (less JSON work)
    //
    // maybe it makes sense not to include the current item in the set? for LFU, certainly you'd want it

    peerweb.cache.StorageCache.policy = {

        /*
         * Least Recently Used
         */
        LruRuntime: function(getPolicyInfo, setPolicyInfo) {
            this.recordPolicyInfo = function(resource, object) {
                setPolicyInfo(resource, _.now());
            };
            this.chooseVictim = function(resources) {
                var sortedResources = resources.sort(function(a, b) {
                    return parseInt(getPolicyInfo(b)) - parseInt(getPolicyInfo(a));
                });
                var victim = sortedResources.pop();
                return victim;
            };
        },

        /*
         * Least Recently Used (6+2)
         */
        LruSample: function(getPolicyInfo, setPolicyInfo) {

            var carried = new Array();

            this.recordPolicyInfo = function(resource, object) {
                setPolicyInfo(resource, _.now());
            };
            this.chooseVictim = function(resources) {

                var samples = _.union(carried, _.sample(resources, 8 - carried.length));
                samples = samples.sort(function(a, b) {
                    return parseInt(getPolicyInfo(b)) - parseInt(getPolicyInfo(a));
                });

                //console.log('>>> SAMPLES:', samples)

                var victim = samples.pop();
                carried = _.last(samples, 2);

                return victim;
            };
        },

        /*
         * Least Frequently Used
         */
        LfuRuntime: function(getPolicyInfo, setPolicyInfo) {
            this.recordPolicyInfo = function(resource, object) {
                setPolicyInfo(resource, parseInt(getPolicyInfo(resource)) + 1);
            };
            this.chooseVictim = function(resources) {
                var sortedResources = resources.sort(function(a, b) {
                    return parseInt(getPolicyInfo(b)) - parseInt(getPolicyInfo(a));
                });
                var victim = sortedResources.pop();
                return victim;
            };
        },

        /*
         * Least Frequently Used (6 + 2)
         */
        LfuSample: function(getPolicyInfo, setPolicyInfo) {

            var carried = new Array();

            this.recordPolicyInfo = function(resource, object) {
                setPolicyInfo(resource, parseInt(getPolicyInfo(resource)) + 1);
            };
            this.chooseVictim = function(resources) {

                var samples = _.union(carried, _.sample(resources, 8 - carried.length));
                samples = samples.sort(function(a, b) {
                    return parseInt(getPolicyInfo(b)) - parseInt(getPolicyInfo(a));
                });

                //console.log('>>> SAMPLES:', samples)

                var victim = samples.pop();
                carried = _.last(samples, 2);

                return victim;
            };
        },

        /*
         * Minimum Size
         */
        MinsRuntime: function(getPolicyInfo, setPolicyInfo) {
            this.recordPolicyInfo = function(resource, object) {
                if (!getPolicyInfo(resource)) {
                    setPolicyInfo(resource, object.length);
                }
            };
            this.chooseVictim = function(resources) {
                var sortedResources = resources.sort(function(a, b) {
                    return parseInt(getPolicyInfo(b)) - parseInt(getPolicyInfo(a));
                });
                var victim = sortedResources.pop();
                return victim;
            };
        },

        /*
         * Minimum Size (6+2)
         */
        MinsSample: function(getPolicyInfo, setPolicyInfo) {

            var carried = new Array();

            this.recordPolicyInfo = function(resource, object) {
                if (!getPolicyInfo(resource)) {
                    setPolicyInfo(resource, object.length);
                }
            };
            this.chooseVictim = function(resources) {

                var samples = _.union(carried, _.sample(resources, 8 - carried.length));
                samples = samples.sort(function(a, b) {
                    return parseInt(getPolicyInfo(b)) - parseInt(getPolicyInfo(a));
                });

                //console.log('>>> SAMPLES:', samples)

                var victim = samples.pop();
                carried = _.last(samples, 2);

                return victim;
            };
        },

        /*
         * Maximum Size
         */
        MaxsRuntime: function(getPolicyInfo, setPolicyInfo) {

            this.recordPolicyInfo = function(resource, object) {
                if (!getPolicyInfo(resource)) {
                    setPolicyInfo(resource, object.length);
                }
            };
            this.chooseVictim = function(resources) {
                var sortedResources = resources.sort(function(a, b) {
                    return parseInt(getPolicyInfo(a)) - parseInt(getPolicyInfo(b));
                });
                var victim = sortedResources.pop();
                return victim;
            };
        },

        /*
         * Maximum Size (6+2)
         */
        MaxsSample: function(getPolicyInfo, setPolicyInfo) {

            var carried = new Array();

            this.recordPolicyInfo = function(resource, object) {
                if (!getPolicyInfo(resource)) {
                    setPolicyInfo(resource, object.length);
                }
            };
            this.chooseVictim = function(resources) {

                var samples = _.union(carried, _.sample(resources, 8 - carried.length));
                samples = samples.sort(function(a, b) {
                    return parseInt(getPolicyInfo(a)) - parseInt(getPolicyInfo(b));
                });

                //console.log('>>> SAMPLES:', samples)

                var victim = samples.pop();
                carried = _.last(samples, 2);

                return victim;
            };
        },

        // FIXME: sample should consider new item

    };
})(window.peerweb = window.peerweb || {});
