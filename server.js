var static = require('node-static');
var http = require('http');
var file = new(static.Server)();
var url = require("url");

var sourceDir = './src/';

var crypto = require('crypto');

// For getting image size: https://github.com/netroy/image-size
// npm install image-size
var sizeOf= require('image-size');

var peerwebScripts = '\n\
    <script src="lib/jquery.min.js"></script> \n\
    <script src="lib/peer.min.js"></script> \n\
    <script src="lib/pwcache/js/pwcache.js"></script> \n\
    <script src="lib/sha1.min.js"></script> \n\
    <script src="lib/underscore.min.js"></script> \n\
    <script src="js/peerweb-statistics.js"></script> \n\
    <script src="js/peerweb-net.js"></script> \n\
    <script src="js/peerweb-fallback.js"></script> \n\
    <script src="js/peerweb-selenium.js"></script> \n\
    <script src="lib/pwcache/js/peerweb-js-cache.js"></script> \n\
    <script src="lib/pwcache/js/peerweb-storage-cache.js"></script> \n\
    <script src="js/peerweb-content.js"></script> \n\
    <script type="text/javascript">var loader = new peerweb.PeerWeb();</script> \
';
var peerwebPageLoad = '<script type="text/javascript">loader.done();</script>';

// Build key value pair for webpage content
// http://docs.nodejitsu.com/articles/file-system/how-to-read-files-in-nodejs
// http://nodeexamples.com/2013/12/13/using-the-dba-module-in-a-gruntjs-task/
var fs = require('fs');
var content = {};
var dataLength = 15500; //30000; // chunk size in bytes
var sources = fs.readdirSync(sourceDir);
for (var i = 0; i < sources.length; i++) {
    var source = sources[i];
    // File reading and writing: http://stackoverflow.com/questions/11986350/node-js-read-and-write-file-lines
    console.log('Generating PeerWeb source for', source);
    var htmlFile = fs.readFileSync(sourceDir + source);
    var html = htmlFile.toString();

    // https://github.com/MatthewMueller/cheerio
    var cheerio = require('cheerio');
    var $ = cheerio.load(html);

    // Add peerweb code to html file
    $('body').prepend(peerwebScripts);
    $('body').append(peerwebPageLoad);

    modifyHTML();

    // Modify html for peerweb
    function modifyHTML() {
      $('div.peerdiv').each(function(i, elem) {

        var baseContent = $.html(this);

        var objects = new Array();

        var data = JSON.stringify({
            'html': baseContent
        });

        do {

            var dataPiece = data.substring(0, dataLength);
            data = data.substring(dataLength, data.length);

            var shaSum = crypto.createHash('sha1');
            shaSum.update(dataPiece);
            var hash = shaSum.digest('hex');

            pwobject = {
              'resource': hash,
              'data':     dataPiece
            };
            content[hash] = JSON.stringify(pwobject);

            objects.push(hash);

        } while (data.length > 0);

        // Replace Div with peerweb info
        peer = '<div id="d' + i + '"></div><script type="text/javascript">loader.load({\'resources\': [';
        for (var index = 0; index < objects.length; index++) {
            peer += '\'' + objects[index] + '\',';
        }
        peer += '],\'into\':     \'d' + i + '\'});</script>';
        $(this).replaceWith(peer);
      });

      var imageContent;
      $('img').each(function(i, elem) {
        var t = $(this);
        imagePath = $(this).attr('src');
        console.log('\tConverting image', imagePath);
        dimensions = sizeOf(imagePath);
        image = fs.readFileSync(imagePath).toString('base64');
        extArray = imagePath.split('.');
        ext = extArray[extArray.length - 1];

        var objects = new Array();

        // http://tools.ietf.org/html/rfc2397
        image = 'data:image/' + ext + ';base64,' + image;

        //console.log('FULL IMAGE', image);

        var data = JSON.stringify({
           'width':  dimensions.width,
           'height': dimensions.height,
           'image':  image
        });

        do {

            var dataPiece = data.substring(0, dataLength);
            data = data.substring(dataLength, data.length);

            var shaSum = crypto.createHash('sha1');
            shaSum.update(dataPiece);
            var hash = shaSum.digest('hex');

            pwobject = {
              'resource': hash,
              'data':     dataPiece
            };
            content[hash] = JSON.stringify(pwobject);

            //console.log('HASH =', hash, '; FOR =', dataPiece);

            objects.push(hash);

        } while (data.length > 0);

        // Replace Div with peerweb info
        peer = '<canvas id="i' + i + '"></canvas><script type="text/javascript">loader.load({\'resources\': [';
        for (var index = 0; index < objects.length; index++) {
            peer += '\'' + objects[index] + '\',';
        }
       peer += '],into:    \'i' + i + '\'});</script>';

        $(this).replaceWith(peer);
      });
      createShellFile(source, $.html());
    }
    // $.html() does not include <html></html> tags
}

// Create shell file
// Need to make this a function due to async png parsing
function createShellFile(source, html) {
  fs.writeFileSync('./' + source, html);
}

console.log('==== STARTING SERVER ====');
http.createServer(function (request, response) {

    var path = url.parse(request.url).pathname;
    console.log('Received request for path', path);


    if (path.search('/resource/') == 0) {
        hash = path.substr(10);
        if(content[hash] != null){
            var id = request.socket.remoteAddress+':'+request.socket.remotePort
            console.log(id+' fell back');

            response.writeHeader(200);
            response.write(content[hash]);
            response.end();
        } else {
            response.writeHeader(404);
            response.write('peerweb resource not found.');
            response.end();
        }
    } else {
      file.serve(request,response);
    }
}).listen(8000);

