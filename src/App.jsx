import { useState, useEffect } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Music, ListMusic, ArrowDownAZ, LogIn, X, SkipBack, SkipForward, LogOut } from 'lucide-react'
import YouTube from 'react-youtube'
import './index.css'

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('yt_token'))
  const [playlists, setPlaylists] = useState([])
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(false)
  const [isSortedAlphabetically, setIsSortedAlphabetically] = useState(false)
  const [playingSong, setPlayingSong] = useState(null)
  const [player, setPlayer] = useState(null)
  const [isPlaying, setIsPlaying] = useState(true)

  // Login handler
  const login = useGoogleLogin({
    onSuccess: (codeResponse) => {
      setToken(codeResponse.access_token)
      localStorage.setItem('yt_token', codeResponse.access_token)
    },
    onError: (error) => console.log('Login Failed:', error),
    scope: 'https://www.googleapis.com/auth/youtube.readonly'
  })
  
  const logout = () => {
    setToken(null)
    localStorage.removeItem('yt_token')
    setPlaylists([])
    setSongs([])
    setSelectedPlaylist(null)
  }

  // Interactive Background Pointer Logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Fetch Playlists when token is available
  useEffect(() => {
    if (token) {
      fetchPlaylists()
    }
  }, [token])

  const fetchPlaylists = async () => {
    try {
      setLoading(true)
      const response = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          part: 'snippet,contentDetails',
          mine: true,
          maxResults: 50
        }
      })
      setPlaylists(response.data.items || [])
    } catch (error) {
      console.error("Error fetching playlists", error)
      if (error.response && error.response.status === 401) {
        // Token expired
        logout()
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch Songs for a selected playlist
  const fetchPlaylistItems = async (playlistId) => {
    try {
      setLoading(true)
      setSelectedPlaylist(playlistId)
      setIsSortedAlphabetically(false)
      let allItems = []
      let nextPageToken = ''

      // Fetch all pages of the playlist
      do {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            part: 'snippet,contentDetails',
            playlistId: playlistId,
            maxResults: 50,
            pageToken: nextPageToken
          }
        })
        allItems = [...allItems, ...response.data.items]
        nextPageToken = response.data.nextPageToken
      } while (nextPageToken)

      // Process and clean up artist names
      const processedSongs = allItems.map(item => {
        const title = item.snippet.title
        const rawArtist = item.snippet.videoOwnerChannelTitle || "Unknown Artist"
        
        // Basic cleanup for YouTube Music artist names
        let cleanArtist = rawArtist
          .replace(/ - Topic$/i, '')
          .replace(/VEVO$/i, '')
          .replace(/Official$/i, '')
          .trim()

        return {
          id: item.id,
          videoId: item.contentDetails.videoId,
          title: title,
          artist: cleanArtist,
          thumbnail: item.snippet.thumbnails?.default?.url || '',
          position: item.snippet.position
        }
      })

      setSongs(processedSongs)
    } catch (error) {
      console.error("Error fetching playlist items", error)
      if (error.response && error.response.status === 401) {
        logout()
      }
    } finally {
      setLoading(false)
    }
  }

  // Toggle sorting
  const toggleSort = () => {
    setIsSortedAlphabetically(!isSortedAlphabetically)
  }

  // Get displayed songs based on sort state
  const displayedSongs = [...songs].sort((a, b) => {
    if (isSortedAlphabetically) {
      return a.artist.localeCompare(b.artist)
    }
  // Default YouTube playlist order
    return a.position - b.position
  })

  // Player Controls Logic
  const currentIndex = displayedSongs.findIndex(s => s.videoId === playingSong?.videoId)
  const hasNext = currentIndex >= 0 && currentIndex < displayedSongs.length - 1
  const hasPrev = currentIndex > 0

  const playNext = () => {
    if (hasNext) setPlayingSong(displayedSongs[currentIndex + 1])
  }

  const playPrev = () => {
    if (hasPrev) setPlayingSong(displayedSongs[currentIndex - 1])
  }
  
  const onPlayerReady = (event) => {
    setPlayer(event.target)
  }

  const togglePlay = () => {
    if (player) {
      if (isPlaying) {
        player.pauseVideo()
        setIsPlaying(false)
      } else {
        player.playVideo()
        setIsPlaying(true)
      }
    }
  }

  const handleStateChange = (e) => {
    if (e.data === 1) setIsPlaying(true) // Playing
    if (e.data === 2) setIsPlaying(false) // Paused
    if (e.data === 0) playNext() // Ended -> Autoplay next
  }

  // Render Login Screen if not authenticated
  if (!token) {
    return (
      <div className="login-screen">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel login-card"
        >
          <img src="/logo.png" alt="Logo" className="app-logo" style={{ width: '80px', height: '80px' }} />
          <h1 className="gradient-text">YT Music Sorter</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Connect your YouTube account to sort your playlists by artist alphabetically.
          </p>
          <button className="btn-primary" onClick={() => login()}>
            <LogIn size={20} />
            Connect YouTube Music
          </button>
          
          <div style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
            <strong>Note:</strong> You will need to provide a Google Client ID in <code>main.jsx</code> for this to work in your own environment.
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="/logo.png" 
            alt="Logo" 
            className={`app-logo ${playingSong && isPlaying ? 'logo-playing' : ''}`} 
          />
        </div>
        <button 
          onClick={logout} 
          style={{ background: 'transparent', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      <div className="main-content">
        {/* Sidebar */}
        <div className="glass-panel sidebar">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
            <ListMusic size={20} />
            Your Playlists
          </h3>
          
          {loading && playlists.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : (
            playlists.map(playlist => (
              <button
                key={playlist.id}
                className={`playlist-item ${selectedPlaylist === playlist.id ? 'active' : ''}`}
                onClick={() => fetchPlaylistItems(playlist.id)}
              >
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {playlist.snippet.title}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Main Content Area */}
        <div className="glass-panel content-area">
          {selectedPlaylist ? (
            <>
              <div className="controls-header">
                <div>
                  <h2 style={{ margin: 0 }}>
                    {playlists.find(p => p.id === selectedPlaylist)?.snippet.title}
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>
                    {songs.length} songs
                  </p>
                </div>
                <button 
                  className="btn-primary" 
                  onClick={toggleSort}
                  style={{ background: isSortedAlphabetically ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)' }}
                >
                  <ArrowDownAZ size={20} />
                  {isSortedAlphabetically ? 'Sorted by Artist' : 'Sort by Artist'}
                </button>
              </div>

              {loading && songs.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                  <div className="spinner" />
                </div>
              ) : (
                <div className="track-list-container">
                  <AnimatePresence>
                    {displayedSongs.map((song, index) => (
                      <motion.div
                        key={song.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="track-item"
                      >
                        <div className="track-number">{index + 1}</div>
                        <div className="track-title">
                          {song.thumbnail ? (
                            <img src={song.thumbnail} alt="" className="thumbnail" />
                          ) : (
                            <div className="thumbnail" style={{ background: 'rgba(255,255,255,0.1)' }} />
                          )}
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song.title}
                          </div>
                        </div>
                        <div className="track-artist">
                          {song.artist}
                        </div>
                        <button 
                          onClick={() => setPlayingSong(song)}
                          className="track-play"
                          title="Play in App"
                        >
                          <Play size={18} fill="currentColor" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)' }}>
              <ListMusic size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
              <h3>Select a playlist to view</h3>
              <p>Choose a playlist from the sidebar to sort its songs.</p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Audio Player Modal */}
      <AnimatePresence>
        {playingSong && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
            className="player-modal"
            style={{ cursor: 'grab', touchAction: 'none', willChange: 'transform' }}
          >
            <div className="player-content glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <button className="close-btn" style={{ top: 12, right: 12, background: 'rgba(0,0,0,0.5)' }} onClick={() => setPlayingSong(null)}>
                <X size={20} />
              </button>
              
              {/* Hidden YouTube Iframe for Audio Only */}
              <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}>
                <YouTube 
                  videoId={playingSong.videoId} 
                  opts={{ playerVars: { autoplay: 1, controls: 0 } }}
                  onReady={onPlayerReady}
                  onStateChange={handleStateChange}
                />
              </div>
              
              {/* High Quality Thumbnail */}
              <img 
                draggable={false}
                src={`https://img.youtube.com/vi/${playingSong.videoId}/hqdefault.jpg`} 
                alt={playingSong.title} 
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0, 240, 255, 0.2)', pointerEvents: 'none' }} 
                onError={(e) => e.target.src = playingSong.thumbnail}
              />
              
              <div style={{ textAlign: 'center', width: '100%', marginTop: '4px' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playingSong.title}</h4>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{playingSong.artist}</p>
              </div>
              
              <div className="player-controls" style={{ position: 'relative', bottom: 'auto', marginTop: '8px' }}>
                <button className="control-btn" onClick={playPrev} disabled={!hasPrev}>
                  <SkipBack size={24} />
                </button>
                <button className="control-btn" onClick={togglePlay} style={{ width: '60px', height: '60px', background: 'var(--accent-gradient)', color: '#fff', border: 'none' }}>
                  {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                </button>
                <button className="control-btn" onClick={playNext} disabled={!hasNext}>
                  <SkipForward size={24} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
