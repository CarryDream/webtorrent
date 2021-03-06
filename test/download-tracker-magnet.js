var auto = require('run-auto')
var fs = require('fs')
var parseTorrent = require('parse-torrent')
var test = require('tape')
var TrackerServer = require('bittorrent-tracker/server')
var WebTorrent = require('../')

var leavesFile = __dirname + '/content/Leaves of Grass by Walt Whitman.epub'
var leavesTorrent = fs.readFileSync(__dirname + '/torrents/leaves.torrent')
var leavesParsed = parseTorrent(leavesTorrent)

test('Download using UDP tracker (via magnet uri)', function (t) {
  magnetDownloadTest(t, 'udp')
})

test('Download using HTTP tracker (via magnet uri)', function (t) {
  magnetDownloadTest(t, 'http')
})

function magnetDownloadTest (t, serverType) {
  t.plan(8)

  var trackerStartCount = 0
  var magnetUri

  auto({
    tracker: function (cb) {
      var tracker = new TrackerServer(
        serverType === 'udp' ? { http: false } : { udp: false }
      )

      tracker.on('error', function (err) {
        t.fail(err)
      })

      tracker.on('start', function () {
        trackerStartCount += 1
      })

      tracker.listen(function (port) {
        var announceUrl = serverType === 'http'
          ? 'http://127.0.0.1:' + port + '/announce'
          : 'udp://127.0.0.1:' + port

        leavesParsed.announce = [ announceUrl ]
        leavesParsed.announceList = [[ announceUrl ]]
        magnetUri = 'magnet:?xt=urn:btih:' + leavesParsed.infoHash + '&tr=' + encodeURIComponent(announceUrl)
        cb(null, tracker)
      })
    },

    client1: ['tracker', function (cb) {
      var client1 = new WebTorrent({ dht: false })
      client1.on('error', function (err) { t.fail(err) })

      client1.add(leavesParsed)

      client1.on('torrent', function (torrent) {
        // torrent metadata has been fetched -- sanity check it
        t.equal(torrent.name, 'Leaves of Grass by Walt Whitman.epub')

        var names = [
          'Leaves of Grass by Walt Whitman.epub'
        ]

        t.deepEqual(torrent.files.map(function (file) { return file.name }), names)

        torrent.storage.load(fs.createReadStream(leavesFile), function (err) {
          cb(err, client1)
        })
      })
    }],

    client2: ['client1', function (cb) {
      var client2 = new WebTorrent({ dht: false })
      client2.on('error', function (err) { t.fail(err) })

      client2.add(magnetUri)

      client2.on('torrent', function (torrent) {
        torrent.files.forEach(function (file) {
          file.createReadStream()
        })

        torrent.once('done', function () {
          t.pass('client2 downloaded torrent from client1')
          cb(null, client2)
        })
      })
    }]

  }, function (err, r) {
    t.error(err)
    t.equal(trackerStartCount, 2)

    r.tracker.close(function () {
      t.pass('tracker closed')
    })
    r.client1.destroy(function () {
      t.pass('client1 destroyed')
    })
    r.client2.destroy(function () {
      t.pass('client2 destroyed')
    })
  })
}
