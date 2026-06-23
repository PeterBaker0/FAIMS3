pub const MAX_VIEW_ID_LENGTH: usize = 30;
pub const MAX_FIELD_ID_LENGTH: usize = 30;
pub const MAX_HRID_LENGTH: usize = 40;
pub const MAX_CSV_FILENAME_LENGTH: usize = 40;
pub const HASH_SUFFIX_LENGTH: usize = 6;

pub fn simple_hash(input: &str, length: usize) -> String {
    let mut hash: u32 = 5381;
    for byte in input.bytes() {
        hash = ((hash << 5).wrapping_add(hash)) ^ u32::from(byte);
    }
    format!("{hash:0length$x}")[..length.min(format!("{hash:0length$x}").len())].to_string()
}

pub fn truncate_with_hash(input: &str, max_length: usize) -> String {
    if input.len() <= max_length {
        return input.to_string();
    }

    let Some(prefix_length) = max_length.checked_sub(1 + HASH_SUFFIX_LENGTH) else {
        return simple_hash(input, max_length);
    };
    if prefix_length < 1 {
        return simple_hash(input, max_length);
    }

    format!(
        "{}_{}",
        &input[..prefix_length.min(input.len())],
        simple_hash(input, HASH_SUFFIX_LENGTH)
    )
}

pub fn slugify(input: &str) -> String {
    let mut output = String::new();
    let mut previous_was_space = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_whitespace() {
            if !previous_was_space {
                output.push('_');
            }
            previous_was_space = true;
        } else {
            previous_was_space = false;
            if ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-' {
                output.push(ch);
            }
        }
    }
    output
}

pub fn slugify_label(label: &str, max_length: usize) -> String {
    truncate_with_hash(&slugify(label), max_length)
}

pub fn generate_attachment_filename(
    file_mime_type: Option<&str>,
    field_id: &str,
    hrid: &str,
    view_id: &str,
    existing_filenames: &[String],
) -> String {
    let extension = mime_extension(file_mime_type).unwrap_or("dat");
    let safe_view_id = truncate_with_hash(&slugify(view_id), MAX_VIEW_ID_LENGTH);
    let safe_field_id = truncate_with_hash(&slugify(field_id), MAX_FIELD_ID_LENGTH);
    let safe_hrid = truncate_with_hash(&slugify(hrid), MAX_HRID_LENGTH);
    let base = format!("{safe_view_id}/{safe_field_id}/{safe_hrid}");

    let mut postfix = 1;
    let mut filename = format!("{base}.{extension}");
    while existing_filenames.contains(&filename) {
        filename = format!("{base}_{postfix}.{extension}");
        postfix += 1;
    }
    filename
}

fn mime_extension(raw: Option<&str>) -> Option<&'static str> {
    let mime = raw?.split(';').next()?.trim();
    match mime {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/tiff" => Some("tif"),
        "text/plain" => Some("txt"),
        "application/pdf" => Some("pdf"),
        "application/json" => Some("json"),
        "audio/mp4" => Some("m4a"),
        "audio/webm" => Some("webm"),
        "audio/ogg" => Some("ogg"),
        "audio/mpeg" => Some("mp3"),
        "audio/wav" => Some("wav"),
        _ => Some("dat"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_like_typescript_helper() {
        assert_eq!(slugify("Hello World!"), "hello_world");
    }

    #[test]
    fn attachment_filename_collides_with_suffix() {
        let existing = vec!["view/photo/abc.jpg".to_string()];
        assert_eq!(
            generate_attachment_filename(Some("image/jpeg"), "photo", "abc", "view", &existing),
            "view/photo/abc_1.jpg"
        );
    }
}
