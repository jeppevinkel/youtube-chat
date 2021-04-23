export interface IRect {
    x: number
    y: number
    width: number
    height: number
}

export interface ICustomNotification {
    custom: boolean,
    image: string,
    properties: {
        headset: boolean,
        horizontal: boolean,
        channel: number,
        hz: number,
        duration: number,
        width: number,
        distance: number,
        pitch: number,
        yaw: number
    },
    transition: {
        scale: number,
        opacity: number,
        vertical: number,
        horizontal: number,
        spin: number,
        tween: number,
        duration: number
    },
    transition2: {
        scale: number,
        opacity: number,
        vertical: number,
        horizontal: number,
        spin: number,
        tween: number,
        duration: number
    }
}
