//! A tiny PNG writer (uncompressed deflate): enough for an app's icon, 32×32
//! or 48×48, without an image library.

fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xffff_ffffu32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
        }
    }
    !c
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &x in data {
        a = (a + x as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

/// RGBA pixels (row by row, top first) to a PNG file.
pub fn encode_rgba(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    assert_eq!(rgba.len(), (width * height * 4) as usize);
    let mut raw = Vec::with_capacity(rgba.len() + height as usize);
    for row in rgba.chunks((width * 4) as usize) {
        raw.push(0); // no filter
        raw.extend_from_slice(row);
    }
    // zlib: stored (uncompressed) deflate blocks of at most 65535 bytes.
    let mut z = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = if raw.is_empty() { vec![&[][..]] } else { raw.chunks(65535).collect() };
    for (i, b) in blocks.iter().enumerate() {
        z.push(if i == blocks.len() - 1 { 1 } else { 0 });
        let n = b.len() as u16;
        z.extend_from_slice(&n.to_le_bytes());
        z.extend_from_slice(&(!n).to_le_bytes());
        z.extend_from_slice(b);
    }
    z.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut out = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // 8 bits, RGBA
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &z);
    chunk(&mut out, b"IEND", &[]);
    out
}

/// Windows' BGRA (premultiplied or not) to RGBA; rows bottom-up when `flip`.
pub fn bgra_to_rgba(width: u32, height: u32, bgra: &[u8], flip: bool) -> Vec<u8> {
    let row = (width * 4) as usize;
    let mut out = Vec::with_capacity(bgra.len());
    for y in 0..height as usize {
        let src = if flip { height as usize - 1 - y } else { y };
        for px in bgra[src * row..(src + 1) * row].chunks(4) {
            out.extend_from_slice(&[px[2], px[1], px[0], px[3]]);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksums_match_the_standard_ones() {
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
        assert_eq!(adler32(b"Wikipedia"), 0x11e6_0398);
    }

    #[test]
    fn writes_a_valid_png_shape() {
        let px = [255, 0, 0, 255, 0, 255, 0, 128];
        let png = encode_rgba(2, 1, &px);
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
        assert_eq!(&png[12..16], b"IHDR");
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 2);
        assert_eq!(&png[png.len() - 8..png.len() - 4], b"IEND");
        // The pixels are there, after the filter byte.
        let idat = png.windows(4).position(|w| w == b"IDAT").unwrap();
        assert_eq!(&png[idat + 4 + 2 + 5..idat + 4 + 2 + 5 + 9], &[0, 255, 0, 0, 255, 0, 255, 0, 128]);
    }

    #[test]
    fn bgra_turns_and_flips() {
        let bgra = [1, 2, 3, 4, 5, 6, 7, 8];
        assert_eq!(bgra_to_rgba(1, 2, &bgra, false), vec![3, 2, 1, 4, 7, 6, 5, 8]);
        assert_eq!(bgra_to_rgba(1, 2, &bgra, true), vec![7, 6, 5, 8, 3, 2, 1, 4]);
    }
}
