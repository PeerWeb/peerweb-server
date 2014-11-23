// FIXME: These params should be set in some sort of `start` call or
//        something.

var serverName = 'ec2-54-172-37-182.compute-1.amazonaws.com'
var rootBroker = "http://"+serverName+":3000/"
var peerServer = {
  host:  serverName,
  port:  9000,
  path: '/broker',
  key:  'pwnet'
};
var peerwebParams = {
  'debug':           'info',
  'updateInterval':  500,
  'collectStats':    true,
  'maxPeers':        15,
  'peersPerRequest': 15,
  'peerSelection':   'linear'
};
