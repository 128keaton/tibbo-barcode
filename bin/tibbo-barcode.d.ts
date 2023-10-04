import { Collection } from 'simpl.db';
/**
 * Create a barcode PDF
 * @param type
 * @param mac
 * @param port
 * @param output
 * @returns {Promise<unknown>}
 */
export declare const createPDF: (type: string, mac: string, port: number, output: string) => Promise<unknown>;
/**
 * Process Tibbo devices
 * @param newDevices
 * @param devicesCollection
 * @param printer
 * @param port
 */
export declare const processDevices: (newDevices: {
    board: string;
    id: string;
}[], devicesCollection: Collection<string>, printer: string, port: number) => void;
/**
 * Process Tibbo device
 * @param device
 */
export declare const processDevice: (device: {
    board: string;
    id: string;
}) => {
    mac: string;
    type: string;
};
