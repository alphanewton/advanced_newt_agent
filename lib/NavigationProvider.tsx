"use client";
import React, {createContext} from 'react'

interface NavigationContextType{
    isMobileNavOpen: boolean;
    setIsMobileNavOpen: (isOpen: boolean) => void;
    closeMobileNav: () => void;
}

export const NavigationContext = createContext<NavigationContextType>({
    isMobileNavOpen: false,
    setIsMobileNavOpen: () => {},
    closeMobileNav: () => {}
});

export default function NavigationProvider({children}: {children: React.ReactNode}) {
    const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);

    const closeMobileNav = () => setIsMobileNavOpen(false);

    return (
        <NavigationContext.Provider value={{isMobileNavOpen, setIsMobileNavOpen, closeMobileNav}}>
            {children}
        </NavigationContext.Provider>
    )
}