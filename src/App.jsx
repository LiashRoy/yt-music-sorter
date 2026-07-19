import { useState, useEffect, useRef } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Music, ListMusic, ArrowDownAZ, LogIn, X, SkipBack, SkipForward, LogOut, Search, ExternalLink } from 'lucide-react'
import YouTube from 'react-youtube'
import './index.css'

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('yt_token'))
  const [playlists, setPlaylists] = useState([])
  const [selectedPlaylist, setSelectedPlaylist] = useState(() => localStorage.getItem('yt_last_playlist'))
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [playingSong, setPlayingSong] = useState(null)
  const [unplayableSongs, setUnplayableSongs] = useState(new Set())
  const [player, setPlayer] = useState(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const stateRef = useRef()
  stateRef.current = { displayedSongs, playingSong, player }

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
    localStorage.removeItem('yt_last_playlist')
    setPlaylists([])
    setSongs([])
    setSelectedPlaylist(null)
    setUnplayableSongs(new Set())
  }

  // Interactive Background Pointer Logic
  useEffect(() => {
    let ticking = false;
    const handleMouseMove = (e) => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
          document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Track Progress
  useEffect(() => {
    let interval;
    if (isPlaying && player && !isDragging) {
      interval = setInterval(() => {
        if (player.getCurrentTime) {
          setCurrentTime(player.getCurrentTime());
          setDuration(player.getDuration());
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, player, isDragging]);

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds === 0) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

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
      
      // Auto-load last opened playlist
      const savedPlaylist = localStorage.getItem('yt_last_playlist')
      if (savedPlaylist && (response.data.items || []).find(p => p.id === savedPlaylist)) {
        fetchPlaylistItems(savedPlaylist)
      }
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
      localStorage.setItem('yt_last_playlist', playlistId)
      setSearchQuery('')
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

  // Get displayed songs based on search state and always sort by artist
  const displayedSongs = [...songs]
    .filter(song => {
      const query = searchQuery.toLowerCase()
      return song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)
    })
    .sort((a, b) => a.artist.localeCompare(b.artist))

  const handlePlaySong = (song) => {
    if (playingSong && playingSong.videoId === song.videoId) {
      togglePlay();
      return;
    }

    setPlayingSong(song)
    setIsPlaying(true)
    
    if (player && typeof player.playVideo === 'function') {
      player.playVideo()
    }
    
    if (searchQuery) {
      // Defer the heavy list render so it doesn't block the YouTube autoplay gesture token
      setTimeout(() => {
        setSearchQuery('')
        // Allow the full list to render before scrolling
        setTimeout(() => {
          const element = document.getElementById(`track-${song.videoId}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 150)
      }, 50)
    }
  }

  // Player Controls Logic
  const currentIndex = displayedSongs.findIndex(s => s.videoId === playingSong?.videoId)
  const hasNext = currentIndex >= 0 && currentIndex < displayedSongs.length - 1
  const hasPrev = currentIndex > 0

  const playNext = () => {
    const { displayedSongs, playingSong, player } = stateRef.current;
    const idx = displayedSongs.findIndex(s => s.videoId === playingSong?.videoId);
    if (idx >= 0 && idx < displayedSongs.length - 1) {
      const nextSong = displayedSongs[idx + 1];
      setPlayingSong(nextSong);
      // Imperatively load the video to bypass React background tab throttling
      if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById(nextSong.videoId);
      }
    }
  }

  const playPrev = () => {
    const { displayedSongs, playingSong, player } = stateRef.current;
    const idx = displayedSongs.findIndex(s => s.videoId === playingSong?.videoId);
    if (idx > 0) {
      const prevSong = displayedSongs[idx - 1];
      setPlayingSong(prevSong);
      if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById(prevSong.videoId);
      }
    }
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

  const handlePlayerError = (e) => {
    console.warn("YouTube Player Error:", e.data);
    
    // Mark song as unplayable
    if (playingSong) {
      setUnplayableSongs(prev => {
        const newSet = new Set(prev);
        newSet.add(playingSong.videoId);
        return newSet;
      });
    }

    // Error 101/150: Embedding disabled. Error 100: Video deleted/private.
    // Automatically skip to the next track when a video cannot be played.
    playNext();
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
          <img src="./logo.png" alt="Logo" className="app-logo" style={{ width: '80px', height: '80px' }} />
          <h1 className="gradient-text">MyMusic</h1>
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
            src="./logo.png" 
            alt="Logo" 
            className={`app-logo ${playingSong && isPlaying ? 'logo-playing' : ''}`} 
          />
        </div>
        <button 
          onClick={logout} 
          className="btn-outline"
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      <div className={`main-content ${playingSong ? 'has-player' : ''}`}>
        {/* Left Column */}
        <div className="left-column">
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
          
          {/* Custom Audio Player Modal placed inside the layout flow */}
          <AnimatePresence>
            {playingSong && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="player-modal"
              >
                <div className="player-content glass-panel">
                  <button className="close-btn" onClick={() => setPlayingSong(null)}>
                    <X size={20} />
                  </button>
                  
                  {/* Hidden YouTube Iframe for Audio Only */}
                  <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}>
                    <YouTube 
                      videoId={playingSong.videoId} 
                      opts={{ playerVars: { autoplay: 1, controls: 0 } }}
                      onReady={onPlayerReady}
                      onStateChange={handleStateChange}
                      onError={handlePlayerError}
                    />
                  </div>
                  
                  {/* High Quality Thumbnail */}
                  <img 
                    draggable={false}
                    className="player-thumb"
                    src={`https://img.youtube.com/vi/${playingSong.videoId}/hqdefault.jpg`} 
                    alt={playingSong.title} 
                    onError={(e) => e.target.src = playingSong.thumbnail}
                  />
                  
                  <div className="player-info">
                    <h4>{playingSong.title}</h4>
                    <p>{playingSong.artist}</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="player-progress-container">
                    <input 
                      type="range" 
                      min={0} 
                      max={duration || 100} 
                      value={currentTime}
                      onMouseDown={() => setIsDragging(true)}
                      onMouseUp={(e) => {
                        setIsDragging(false);
                        if (player && typeof player.seekTo === 'function') player.seekTo(parseFloat(e.target.value), true);
                      }}
                      onTouchStart={() => setIsDragging(true)}
                      onTouchEnd={(e) => {
                        setIsDragging(false);
                        if (player && typeof player.seekTo === 'function') player.seekTo(parseFloat(e.target.value), true);
                      }}
                      onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                      className="progress-bar"
                      style={{ background: `linear-gradient(to right, var(--accent-color) ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.1) ${(currentTime / (duration || 1)) * 100}%)` }}
                    />
                    <div className="time-display">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>
                  
                  <div className="player-controls">
                    <button className="control-btn" onClick={playPrev} disabled={!hasPrev}>
                      <SkipBack size={24} />
                    </button>
                    <button className="control-btn play-pause" onClick={togglePlay}>
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
                <div style={{ position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input 
                    type="text" 
                    placeholder="Search in playlist..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
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
                        id={`track-${song.videoId}`}
                        key={song.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`track-item ${playingSong?.videoId === song.videoId ? 'playing' : ''}`}
                      >
                        {unplayableSongs.has(song.videoId) ? (
                          <a 
                            href={`https://www.youtube.com/watch?v=${song.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="track-play blocked-play"
                            title="Play on YouTube"
                          >
                            <ExternalLink size={18} />
                          </a>
                        ) : (
                          <button 
                            onClick={() => handlePlaySong(song)}
                            className={`track-play ${playingSong?.videoId === song.videoId ? 'active' : ''}`}
                            title={playingSong?.videoId === song.videoId && isPlaying ? "Pause" : "Play in App"}
                          >
                            {playingSong?.videoId === song.videoId && isPlaying ? (
                              <Pause size={18} fill="currentColor" />
                            ) : (
                              <Play size={18} fill="currentColor" />
                            )}
                          </button>
                        )}
                        <div className="track-number">{index + 1}</div>
                        <div className="track-title" style={{ minWidth: 0 }}>
                          {song.thumbnail ? (
                            <img src={song.thumbnail} alt="" className="thumbnail" />
                          ) : (
                            <div className="thumbnail" style={{ background: 'rgba(255,255,255,0.1)' }} />
                          )}
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{song.title}</span>
                            {unplayableSongs.has(song.videoId) && (
                              <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255,50,50,0.2)', color: '#ff4444', borderRadius: '4px', border: '1px solid rgba(255,50,50,0.4)', flexShrink: 0 }}>Blocked</span>
                            )}
                          </div>
                        </div>
                        <div className="track-artist">
                          {song.artist}
                        </div>
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

      {/* Player moved to left column */}
    </div>
  )
}

export default App
