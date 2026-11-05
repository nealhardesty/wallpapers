namespace Wallpapers.Core;

public static class SaverInput
{
    /// Pixels the pointer may drift before the saver ends; a bumped desk must not wake it.
    public const int MoveThreshold = 8;

    public static bool Moved(int startX, int startY, int x, int y)
    {
        long dx = x - (long)startX, dy = y - (long)startY;
        return dx * dx + dy * dy > (long)MoveThreshold * MoveThreshold;
    }
}
