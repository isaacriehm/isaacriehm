declare module 'subset-font' {
  interface SubsetOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2';
    keepFeatures?: string[];
    noHinting?: boolean;
    preserveNameIds?: number[];
  }
  export default function subsetFont(buffer: Buffer, text: string, options?: SubsetOptions): Promise<Buffer>;
}
