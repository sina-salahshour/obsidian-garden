import { createContext } from "react";

/** True inside a body link: interactive children (the image zoom button) would nest controls. */
export const InLink = createContext(false);
