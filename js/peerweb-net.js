/*
 * vim: tabstop=2 shiftwidth=2 expandtab
 */

(function(peerweb) {
  "use strict";
  peerweb.net = peerweb.net || {};

  var maxPeers;
  var updateInterval;
  var peersPerRequest;
  var debug;
  var thisPeer;
  var additionalPeers;
  var collectStats; 
  var peerSelection;

  function parseParams(params){

    if (typeof params['maxPeers']==='number'){
      maxPeers = params['maxPeers']
    }
    else {
      maxPeers = 0 //manual
    }

    if (typeof params['updateInterval']==='number'){
      updateInterval = params['updateInterval']
    }
    else{
      updateInterval = 1000 //1s
    }

    if (params['collectStats']){
     collectStats = params['collectStats'];
    }
    else {
      collectStats = false;
    }

    if (params['peersPerRequest']){
      peersPerRequest = params['peersPerRequest'];
    }
    else {
      peersPerRequest = 3;
    }

    if (params['peerSelection']){
      peerSelection = params['peerSelection'];
    }
    else {
      peerSelection = 'linear';
    }

    switch (params['debug']){
      case 'info':
        debug={'info':true , 'warn':true , 'emer':true}
        break;
      case 'warn':
        debug={'info':false, 'warn':true , 'emer':true}
        break;
      case 'none':
        debug={'info':false, 'warn':false, 'emer':false}
        break;
      default:
        debug={'info':false, 'warn':false, 'emer':true}
    }
  }

  function pwNode() {
    //this.me = new Peer({key: '7jbhxe9o38t9y66r'});
    this.me = new Peer(peerServer);
    this.peers = [];
    this.onPeerUpdate = [];
    this.stats = {
      'firstPeer':         -1,
      'peerChange':	   0,
      'maxPeers':          0,
      'requestsSent':      0,
      'requestsSatisfied': 0,
      'requestsReceived':  0
    };

    ///////////////////////////////////
    //// Listeners ////////////////////
    ///////////////////////////////////

    //called when the node is created and open for connections
    this.me.on('open', function(id) {
        if (debug.info) {console.log('My peer ID is: ' + id)};
    });

    //make myself ready for connections
    this.me.on('connection',
      function(conn) {
        //someone is connecting to me
        conn.on('open', function() {
          if (debug.info) {console.log(conn.peer + ' is connecting to me')};

          // If this peer already exists in the list, Destroy it and let it be created again.
          // It would only be connecting again if it lost its connection, or something went
          // wrong.
          //if (thisPeer.getPeer(conn.peer) ){
          //  thisPeer.destroyPeer(conn.peer);
          //}
          additionalPeers = maxPeers - thisPeer.getPeerCount();
          if (additionalPeers > 0){
            var newPeer = thisPeer.addPeer(conn.peer);
            newPeer.conn = conn;
          }
        });

        //someone is sending me a message
        conn.on('data', function(data) {
          if (debug.info) {console.log('Recieved message from '+conn.peer);}
          thisPeer.handleMessage(conn.peer,data);
        });

      }
    );

    ///////////////////////////////////
    //// FUNCTIONS ////////////////////
    ///////////////////////////////////
    this.connect = function(id){
        return this.me.connect(id)
    };

    this.handleMessage = function(peerID,message){
      var peer = this.getPeer(peerID);
      var payload = message['payload'];
      switch(message['type']){
        case 'dataRequest':
          if (debug.info) {console.log('Peer is requesting data: '+payload);}
          if (debug.info) {console.log('Peer is requesting data: '+payload);}
          var data = thisPeer.onContentRequest(payload);
          if (debug.info) {console.log('GOING TO SEND BACK: ', data);}
          if (data != null) { // don't send anything if we don't have it
            peer.sendData(data);
          }
          if (collectStats){ thisPeer.addStat('dataRequest') }
          break;
        case 'dataReply':
          if (debug.info) {
            console.log('Peer replied with: ', payload);
          }
          thisPeer.onContentReceive(payload);
          if (collectStats){ thisPeer.addStat('dataReply') }
          break;
        case 'ping':
          peer.sendMessage('pong');
          break;
        case 'pong':
          var timeDiff = new Date() - peer.pingStart;
          if (debug.info){console.log(timeDiff)}
          peer.latency = timeDiff;
          break;
        default:
          if (debug.info) {console.log('unknown message type: '+payload);}
      }
    };

    this.broadcastMessage = function(numPeers,type, message){
      var peers = this.getConnectedPeers(numPeers);
      for (var i = peers.length - 1; i >= 0; i--) {
        peers[i].sendMessage(type,message);
      }
    }

    this.peersUpdated = function(){
      if (debug.info) {console.log('Peers Changed');}
      for (var i=0;i<thisPeer.onPeerUpdate.length;i++){
        if (debug.info) {console.log('running callback'+i);}
        thisPeer.onPeerUpdate[i]();
      }
    }
    this.addUpdateCallback = function(callback){
      thisPeer.onPeerUpdate.push(callback);
    }
    this.onContentRequest = null;
    this.onContentReceive = null;
    this.requestData = function(hash){
      thisPeer.broadcastMessage(peersPerRequest,'dataRequest',hash);
      if (collectStats){ thisPeer.addStat('sendingRequest') }
    }

    this.addStat = function(statSource) {
      if (debug.info) {console.log('updateing stats for '+statSource)}
      switch (statSource) {
        case 'peerChange':
          if (this.stats['firstPeer'] == -1){
            this.stats['firstPeer'] = _.now();
          }
          this.stats['maxPeers'] = Math.max(this.stats['maxPeers'],this.getConnectedPeers(99999).length);
	  this.stats['peerChange'] += 1;
          break;
        case 'sendingRequest':
          this.stats['requestsSent'] += 1;
          break;
        case 'dataReply':
          this.stats['requestsSatisfied'] += 1;
          break;
        case 'dataRequest':
          this.stats['requestsRecieved'] += 1;
          break;
        default:
          this.stats[statSource] = Date()
      }
    }

    this.getStatistics = function() {
      thisPeer.peersUpdated();
      var connectedPeers = thisPeer.getConnectedPeers(999999);
      var sum = 0;
      for (var i=0;i<connectedPeers.length;i++){
	var connectedTime = _.now() - connectedPeers[i].connectedOn;
	sum += connectedTime;
      }
      thisPeer.stats['averagePeerAge'] = sum / connectedPeers.length;
      return thisPeer.stats;
    };

    this.addPeer = function(id,broker){
      broker = typeof broker !== 'undefined' ? broker : this;
      if ( ! this.getPeer(id) ){
        var newPeer = new pwPeer( id,this );
        this.peers.push( newPeer );
        //this.peersUpdated();
        return newPeer;
      }
      else {
        if (debug.info) {console.log(id+ ' already exists')}
        return this.getPeer(id);
      }
      this.getPeer(id).ping();
    }

    this.connectToPeers = function(numPeers){
      var peers = this.getPotentialPeers();
      //if (debug.info) { console.log( peers )}
      var cap = Math.min(numPeers,peers.length);
      for (var i=0;i<cap;i++){
        //if (debug.info){console.log('connecting to '+peers[i])}
        this.connectToPeer(peers[i]);
      }
    }


    this.cleanPeers = function(){
      for (var i=0;i<this.peers.length;i++){
        var peer = peers[i];
        if (debug.info) {console.log(this.getPeer(peer))}
      }
    }

    this.connectToPeer = function(id){
      if (id){
        this.getPeer(id).connect(); // FIXME: undefined here?
      }
    }

    this.getPeer = function(peerid){
      if (debug.info){
        console.log('looking up ', peerid);
      }
      var peer = this.peers.filter (
        function (apeer){
          return apeer.id == peerid;
        }
      );
      return peer[0];
    }

    this.getPotentialPeers = function(numPeers){
      var goodPeers = this.peers.filter (
        function (peer){
          return peer.unconnected()
        }
      );
      //if (debug.info){console.log(goodPeers)}
      var cap;
      if (numPeers) {
        cap=numPeers;
      }
      else{
        cap=goodPeers.length;
      }

      var retList=[];
      for (var i=0;i<cap;i++){
        retList.push(goodPeers[i].id);
      }
      return retList

    }

    this.getConnectedPeers = function(numPeers){
      var goodPeers = this.peers.filter (
        function (peer){
          return peer.connected()
        }
      );

      switch (peerSelection) {
        case 'leastUsed':
          goodPeers.sort(function(a,b) { return a.requestCount - b.requestCount });
          break;
        case 'ping':
          goodPeers.sort(function(a,b) { return a.latency - b.latency });
      for (var i=0;i<goodPeers.length;i++){
	 var peer=goodPeers[i];
         console.log(peer.id + ' ' + peer.latency);	
      }
          break;
        case 'geolocation':
          break;
        case 'social':
          break;
      }
      return goodPeers.slice(0,numPeers);
    };

    this.destroyPeer = function(peerID){
      if (debug.info){console.log('Destroying '+peerID)};
      var peerIndex = this.peers.indexOf(this.getPeer(peerID));
      this.peers.splice(peerIndex,1);
    };

    this.getPeersFromRoot = function(id){
      var rootURL = rootBroker;
      var roots = [];
      $.ajax({
        url: rootURL, async: false, dataType: 'json',
        success: function(data) {
          roots = data;
        }
      });
      for (var i=0;i<this.peers.length;i++){
        id = this.peers[i].id;
        var index = roots.indexOf(id);
        if ( index > -1 ){
          roots.splice(index, 1);
        }
      }
      var myIdIndex = roots.indexOf(this.me.id);
      if ( myIdIndex > -1 ){
        roots.splice(myIdIndex, 1);
      }

      for (var i=0; i<roots.length; i++) {
        this.addPeer(roots[i]);
      }

      return roots;
    };

    this.getPeerCount = function(){
      return  this.peers.filter (
          function (peer){
            return peer.connected()
          }
        ).length;
    };
    this.getStatus = function(){
      return 100;
    }
    ///////////////////////////////////
    //// Intervals ////////////////////
    ///////////////////////////////////
    setInterval(function () {
      thisPeer.getPeersFromRoot();
      additionalPeers = maxPeers - thisPeer.getPeerCount();
      if (additionalPeers > 0){
        //if (debug.info){console.log('Connecting to '+additionalPeers+' more peers')};
        thisPeer.connectToPeers(additionalPeers);
      }
    },updateInterval);
  }

  function pwPeer(id,parent) {
    this.connectedStates = ['completed', 'connected'];

    this.parent = parent;
    this.id = id;
    this.status = -1;
    this.quality = -1;
    this.requestCount=0;
    this.connectAttempts=0;
    this.latency = 99999; 
    this.connectedOn = null;
    this.pingStart = null;
    this.ping = function() {
      this.pingStart = new Date();
      this.sendMessage ('ping',{});
       return (parent.getStatus() + (100 - this.latency) + (100 - 5*this.requestCount))/3

    }
    this.connectionState = function () {
      try {
        return this.conn.pc.iceConnectionState
      }
      catch(err){
        return 'unknown'
      }
    }
    this.connected = function () {
      return $.inArray(this.connectionState(), this.connectedStates) > -1 ;
    }
    this.unconnected = function () { return !(this.connected()); }
    this.destroy = function(){
      parent.destroyPeer(this.id);
    }
    this.connect = function(){
      this.connectedOn = _.now();
      this.connectAttempts += 1;
      if (this.connectAttempts >= 5){
        if (debug.info){console.log('5 attepmts to connect to'+this.id)}
        this.destroy();
      }
      if (debug.info){console.log('connecting to '+this.id)}
      this.conn = parent.connect(this.id);
      this.conn.on('open', function (){
        parent.peersUpdated();
      });
      this.conn.on('data', function(data) {
        if (debug.info) {console.log('Recieved message from '+id);}
        parent.handleMessage(id,data);
      });
    };
    this.updateStatus = function(){
        if (this.conn) {
          if (this.conn.open){this.status = 'Open';}
        }
    };
    this.requestPeers = function () {
      if (debug.info) {console.log('I am requesting peers from '+this.id);}
      this.sendMessage('peerRequest',1);
    };
    this.sendPeers = function (peers){
      if (debug.info) {console.log('Sending Peers to '+this.id);}
      var peerList = [];
      for (var i=0;i<peers.length;i++){
        peerList.push(peers[i].id);
      }
      this.sendMessage('peerReply',peers);
    };
    this.sendData = function (data){
      this.sendMessage('dataReply',data);
    }
    this.sendMessage = function (type,payload) {
      if (type == 'dataRequest'){
        this.requestCount +=1;
      }
      var message = {
        'type':type,
        'payload':payload
      }
      this.conn.send(message)
    }
  }
  parseParams(peerwebParams);
  thisPeer = new pwNode();
  peerweb.net.thisPeer = thisPeer;

  if (collectStats){
    thisPeer.addUpdateCallback(function (){
       thisPeer.addStat('peerChange')
     });
  }

  peerweb.net.contentStart = function(callbacks) {
      thisPeer.addUpdateCallback(callbacks.onPeerChange);
      thisPeer.onContentRequest = callbacks.onRequest;
      thisPeer.onContentReceive = callbacks.onReceive;
      return {
        'requestData':   thisPeer.requestData,
        'getStatistics': thisPeer.getStatistics
      };
  };

})(
    window.peerweb = window.peerweb || {}
);

