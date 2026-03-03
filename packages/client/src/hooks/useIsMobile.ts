import { useState, useEffect } from 'react'

interface ResponsiveState {
  isMobile: boolean   // <= 768px
  isTablet: boolean   // 769-1024px
}

const MOBILE_QUERY = '(max-width: 768px)'
const TABLET_QUERY = '(min-width: 769px) and (max-width: 1024px)'

export function useIsMobile(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => ({
    isMobile: window.matchMedia(MOBILE_QUERY).matches,
    isTablet: window.matchMedia(TABLET_QUERY).matches,
  }))

  useEffect(() => {
    const mobileMedia = window.matchMedia(MOBILE_QUERY)
    const tabletMedia = window.matchMedia(TABLET_QUERY)

    const update = () => {
      setState({
        isMobile: mobileMedia.matches,
        isTablet: tabletMedia.matches,
      })
    }

    mobileMedia.addEventListener('change', update)
    tabletMedia.addEventListener('change', update)
    return () => {
      mobileMedia.removeEventListener('change', update)
      tabletMedia.removeEventListener('change', update)
    }
  }, [])

  return state
}
