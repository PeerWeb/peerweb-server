/*
 * PeerWeb Cache tests.
 */

QUnit.test('clear localStorage', function(assert) {
    localStorage.clear();
    assert.ok(true, 'cleared localStorage');
});

QUnit.test('fill localStorage', function(assert) {
    var mb = 0;
    while (true) {
        try {
            localStorage.setItem('mb' + mb, chars_1mb);
            mb += 1;
        } catch(e) {
            if (e.name == 'QuotaExceededError') {
                assert.ok(true, "filled localStorage");
                localStorage.clear();
                return;
            }
        }
    }
});

var cacheTest = function(assert, policy) {

    localStorage.clear();
    var cache = new  peerweb.cache.Cache([
        new peerweb.cache.StorageCache(
            localStorage,
            policy
        )
    ]);

    var totalMb = 10;
    var writtenMb = 0;

    var thisMb = 0;
    for (; thisMb < totalMb; thisMb++) {
        cache.add({
            'resource': thisMb,
            'data':     chars_1mb
        });
    }

    assert.ok(true, 'write ' + thisMb + 'MB to the cache');

    assert.ok(localStorage.length == 8, 'retain 8 objects (assumed 4MB + 4 metadata) in the cache');

    var retainedData = _.groupBy(Object.keys(localStorage), function(key) {
        return key.indexOf('_') == 0 ? 'metadata' : 'data';
    });

    assert.ok(retainedData['metadata'].length == 4, 'retain 4 metadata objects');
    assert.ok(retainedData['data'].length == 4, 'retain 4 data objects');

}

QUnit.test('write more than 5MB with LocalStorage LRU sample cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.LruSample);
});

QUnit.test('write more than 5MB with LocalStorage LRU runtime cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.LruRuntime);
});

QUnit.test('write more than 5MB with LocalStorage LFU sample cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.LfuSample);
});

QUnit.test('write more than 5MB with LocalStorage LFU runtime cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.LfuRuntime);
});

QUnit.test('write more than 5MB with LocalStorage MINS sample cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.MinsSample);
});

QUnit.test('write more than 5MB with LocalStorage MINS runtime cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.MinsRuntime);
});

QUnit.test('write more than 5MB with LocalStorage MAXS sample cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.MaxsSample);
});

QUnit.test('write more than 5MB with LocalStorage MAXS runtime cache', function(assert) {
    cacheTest(assert, peerweb.cache.StorageCache.policy.MaxsRuntime);
});

