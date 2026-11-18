//! The Windows desk on the island, the parts that need no Windows: a copied
//! picture (DIB) to pixels, the files block the clipboard takes (DROPFILES),
//! a pinned shortcut's name, a keyboard layout's short name.

/// A DIB (BITMAPINFOHEADER + pixels, as CF_DIB holds it) to RGBA, top row first.
pub fn dib_to_rgba(dib: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    if dib.len() < 40 {
        return None;
    }
    let u32_at = |i: usize| u32::from_le_bytes(dib[i..i + 4].try_into().unwrap());
    let i32_at = |i: usize| i32::from_le_bytes(dib[i..i + 4].try_into().unwrap());
    let header = u32_at(0) as usize;
    let width = i32_at(4);
    let height = i32_at(8);
    let bits = u16::from_le_bytes([dib[14], dib[15]]);
    let compression = u32_at(16);
    let colors = u32_at(32) as usize;
    if width <= 0 || height == 0 || !(bits == 24 || bits == 32) || !(compression == 0 || compression == 3) {
        return None;
    }
    let (w, h) = (width as usize, height.unsigned_abs() as usize);
    if w > 16_384 || h > 16_384 {
        return None;
    }
    // Masks after a 40-byte header with BI_BITFIELDS; a colour table otherwise.
    let masks = if compression == 3 && header == 40 { 12 } else { 0 };
    let start = header + masks + colors * 4;
    let bpp = bits as usize / 8;
    let stride = (w * bpp).div_ceil(4) * 4;
    if dib.len() < start + stride * h {
        return None;
    }
    let mut out = Vec::with_capacity(w * h * 4);
    let mut any_alpha = false;
    for y in 0..h {
        let row = if height > 0 { h - 1 - y } else { y };
        let line = &dib[start + row * stride..start + row * stride + w * bpp];
        for px in line.chunks(bpp) {
            let a = if bpp == 4 { px[3] } else { 255 };
            any_alpha |= a != 0;
            out.extend_from_slice(&[px[2], px[1], px[0], a]);
        }
    }
    if !any_alpha {
        // 32 bits with no alpha written: opaque.
        for a in out.iter_mut().skip(3).step_by(4) {
            *a = 255;
        }
    }
    Some((w as u32, h as u32, out))
}

/// A smaller copy (nearest pixel) no wider or taller than `max`.
pub fn shrink(w: u32, h: u32, rgba: &[u8], max: u32) -> (u32, u32, Vec<u8>) {
    if w <= max && h <= max {
        return (w, h, rgba.to_vec());
    }
    let k = max as f64 / w.max(h) as f64;
    let (nw, nh) = (((w as f64 * k).round() as u32).max(1), ((h as f64 * k).round() as u32).max(1));
    let mut out = Vec::with_capacity((nw * nh * 4) as usize);
    for y in 0..nh {
        let sy = ((y as f64 + 0.5) / k) as u32;
        for x in 0..nw {
            let sx = ((x as f64 + 0.5) / k) as u32;
            let i = ((sy.min(h - 1) * w + sx.min(w - 1)) * 4) as usize;
            out.extend_from_slice(&rgba[i..i + 4]);
        }
    }
    (nw, nh, out)
}

/// CF_HDROP's block for files: DROPFILES (wide names) and the names.
pub fn dropfiles(paths: &[String]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&20u32.to_le_bytes()); // pFiles: right after this header
    out.extend_from_slice(&0i32.to_le_bytes()); // pt.x
    out.extend_from_slice(&0i32.to_le_bytes()); // pt.y
    out.extend_from_slice(&0i32.to_le_bytes()); // fNC
    out.extend_from_slice(&1i32.to_le_bytes()); // fWide
    for p in paths {
        for u in p.encode_utf16() {
            out.extend_from_slice(&u.to_le_bytes());
        }
        out.extend_from_slice(&[0, 0]);
    }
    out.extend_from_slice(&[0, 0]);
    out
}

/// "Visual Studio Code.lnk" → "Visual Studio Code".
pub fn shortcut_name(file: &str) -> String {
    let name = file.rsplit(['\\', '/']).next().unwrap_or(file);
    name.strip_suffix(".lnk").or_else(|| name.strip_suffix(".LNK")).unwrap_or(name).to_string()
}

/// A layout's short name from its locale: "pt-BR" → "PT", "en-US" → "EN".
pub fn layout_short(locale: &str) -> String {
    locale.split('-').next().unwrap_or("").to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(w: i32, h: i32, bits: u16) -> Vec<u8> {
        let mut d = vec![0u8; 40];
        d[0..4].copy_from_slice(&40u32.to_le_bytes());
        d[4..8].copy_from_slice(&w.to_le_bytes());
        d[8..12].copy_from_slice(&h.to_le_bytes());
        d[12..14].copy_from_slice(&1u16.to_le_bytes());
        d[14..16].copy_from_slice(&bits.to_le_bytes());
        d
    }

    #[test]
    fn a_24_bit_bottom_up_picture() {
        // 1×2: the bottom row (stored first) blue, the top red; rows padded to 4 bytes.
        let mut d = header(1, 2, 24);
        d.extend_from_slice(&[255, 0, 0, 0]); // bottom: B G R + pad
        d.extend_from_slice(&[0, 0, 255, 0]); // top
        let (w, h, px) = dib_to_rgba(&d).unwrap();
        assert_eq!((w, h), (1, 2));
        assert_eq!(px, vec![255, 0, 0, 255, 0, 0, 255, 255]);
    }

    #[test]
    fn a_32_bit_top_down_picture_without_alpha_is_opaque() {
        let mut d = header(2, -1, 32);
        d.extend_from_slice(&[1, 2, 3, 0, 4, 5, 6, 0]);
        let (_, _, px) = dib_to_rgba(&d).unwrap();
        assert_eq!(px, vec![3, 2, 1, 255, 6, 5, 4, 255]);
        assert!(dib_to_rgba(&header(2, 2, 8)).is_none());
        assert!(dib_to_rgba(&header(5, 5, 32)).is_none(), "too short");
    }

    #[test]
    fn shrinking_keeps_the_shape() {
        let px = vec![9u8; 100 * 50 * 4];
        let (w, h, out) = shrink(100, 50, &px, 20);
        assert_eq!((w, h), (20, 10));
        assert_eq!(out.len(), 20 * 10 * 4);
        assert_eq!(shrink(10, 10, &px[..400], 20).0, 10);
    }

    #[test]
    fn the_files_block() {
        let b = dropfiles(&["C:\\a.txt".to_string()]);
        assert_eq!(&b[0..4], &20u32.to_le_bytes());
        assert_eq!(&b[16..20], &1i32.to_le_bytes());
        let names: Vec<u16> = b[20..].chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        assert_eq!(String::from_utf16(&names[..8]).unwrap(), "C:\\a.txt");
        assert_eq!(&names[8..], &[0, 0]);
    }

    #[test]
    fn names() {
        assert_eq!(shortcut_name(r"C:\x\Visual Studio Code.lnk"), "Visual Studio Code");
        assert_eq!(layout_short("pt-BR"), "PT");
        assert_eq!(layout_short("en"), "EN");
    }
}
