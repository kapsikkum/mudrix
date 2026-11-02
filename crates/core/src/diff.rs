use eyeball_im::VectorDiff;
use serde::Serialize;

/// A change to an ordered list (room list, timeline), mirroring `eyeball_im::VectorDiff` with
/// plain values so apps can apply it to their own list type.
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum ListDiff<T> {
    Append { values: Vec<T> },
    Clear,
    PushFront { value: T },
    PushBack { value: T },
    PopFront,
    PopBack,
    Insert { index: usize, value: T },
    Set { index: usize, value: T },
    Remove { index: usize },
    Truncate { length: usize },
    Reset { values: Vec<T> },
}

impl<T> ListDiff<T> {
    pub(crate) fn map<S: Clone>(diff: VectorDiff<S>, f: impl Fn(&S) -> T) -> Self {
        match diff {
            VectorDiff::Append { values } => ListDiff::Append {
                values: values.iter().map(&f).collect(),
            },
            VectorDiff::Clear => ListDiff::Clear,
            VectorDiff::PushFront { value } => ListDiff::PushFront { value: f(&value) },
            VectorDiff::PushBack { value } => ListDiff::PushBack { value: f(&value) },
            VectorDiff::PopFront => ListDiff::PopFront,
            VectorDiff::PopBack => ListDiff::PopBack,
            VectorDiff::Insert { index, value } => ListDiff::Insert {
                index,
                value: f(&value),
            },
            VectorDiff::Set { index, value } => ListDiff::Set {
                index,
                value: f(&value),
            },
            VectorDiff::Remove { index } => ListDiff::Remove { index },
            VectorDiff::Truncate { length } => ListDiff::Truncate { length },
            VectorDiff::Reset { values } => ListDiff::Reset {
                values: values.iter().map(&f).collect(),
            },
        }
    }

    /// Applies the change to a plain list, the way apps without a reactive list type would.
    pub fn apply(self, list: &mut Vec<T>) {
        match self {
            ListDiff::Append { values } => list.extend(values),
            ListDiff::Clear => list.clear(),
            ListDiff::PushFront { value } => list.insert(0, value),
            ListDiff::PushBack { value } => list.push(value),
            ListDiff::PopFront => {
                if !list.is_empty() {
                    list.remove(0);
                }
            }
            ListDiff::PopBack => {
                list.pop();
            }
            ListDiff::Insert { index, value } => list.insert(index, value),
            ListDiff::Set { index, value } => list[index] = value,
            ListDiff::Remove { index } => {
                list.remove(index);
            }
            ListDiff::Truncate { length } => list.truncate(length),
            ListDiff::Reset { values } => *list = values,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eyeball_im::Vector;

    #[test]
    fn mapped_diffs_replay_the_original_changes() {
        let mut source: Vector<i32> = Vector::new();
        let mut mirror: Vec<String> = Vec::new();
        let diffs = vec![
            VectorDiff::Append {
                values: Vector::from(vec![1, 2, 3]),
            },
            VectorDiff::PushFront { value: 0 },
            VectorDiff::Insert { index: 2, value: 9 },
            VectorDiff::Set { index: 0, value: 7 },
            VectorDiff::Remove { index: 1 },
            VectorDiff::PopBack,
            VectorDiff::PushBack { value: 4 },
            VectorDiff::Truncate { length: 3 },
        ];
        for diff in diffs {
            diff.clone().apply(&mut source);
            ListDiff::map(diff, |v| v.to_string()).apply(&mut mirror);
        }
        let expected: Vec<String> = source.iter().map(|v| v.to_string()).collect();
        assert_eq!(mirror, expected);
    }
}
