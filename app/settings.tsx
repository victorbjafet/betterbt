import { APP_VERSION_LABEL } from '@/constants/config';
import { useTheme } from '@/hooks/useTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [zoomScale, setZoomScale] = useState(1.25);
  const [zoomScaleInput, setZoomScaleInput] = useState('1.25');

  const clampZoom = (value: number) => {
    if (Number.isNaN(value)) return 1;
    return Math.max(0.5, Math.min(2, value));
  };

  const handleSliderStep = (step: number) => {
    const nextValue = clampZoom(zoomScale + step);
    setZoomScale(nextValue);
    setZoomScaleInput(nextValue.toFixed(2));
  };

  const handleZoomInputBlur = () => {
    const parsed = Number(zoomScaleInput);
    const nextValue = clampZoom(parsed);
    setZoomScale(nextValue);
    setZoomScaleInput(nextValue.toFixed(2));
  };

  const openRepo = async () => {
    await Linking.openURL('https://github.com/victorbjafet/betterbt');
  };

  const openFeedback = () => {
    Alert.alert('Feedback', 'Thanks for sharing feedback.');
  };

  const openBugReport = () => {
    Alert.alert('Bug Report', 'Thanks for reporting an issue.');
  };

  const goBack = () => {
    const canGoBack =
      typeof (router as { canGoBack?: () => boolean }).canGoBack === 'function'
        ? (router as { canGoBack: () => boolean }).canGoBack()
        : true;

    if (canGoBack) {
      router.back();
      return;
    }

    router.replace('/(tabs)/routes');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.BACKGROUND }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={15} color={theme.TEXT} />
          <Text style={[styles.backButtonText, { color: theme.TEXT }]}>Back</Text>
        </Pressable>

        <Text style={[styles.title, { color: theme.TEXT }]}>Settings</Text>

        <View style={[styles.card, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE }]}> 
          <Text style={[styles.cardTitle, { color: theme.TEXT }]}>Page zoom scale</Text>

          <View style={styles.zoomRow}>
            <TextInput
              value={zoomScaleInput}
              onChangeText={setZoomScaleInput}
              onBlur={handleZoomInputBlur}
              keyboardType="decimal-pad"
              placeholder="Zoom scale"
              placeholderTextColor={theme.TEXT_SECONDARY}
              style={[styles.input, { borderColor: theme.BORDER, color: theme.TEXT, backgroundColor: theme.BACKGROUND }]}
            />

            <View style={styles.sliderRow}>
              <Pressable
                onPress={() => handleSliderStep(-0.1)}
                style={[styles.stepButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
              >
                <Text style={[styles.stepButtonText, { color: theme.TEXT }]}>-</Text>
              </Pressable>

              <View style={[styles.sliderTrack, { backgroundColor: theme.BORDER }]}> 
                <View
                  style={[
                    styles.sliderFill,
                    {
                      backgroundColor: theme.PRIMARY,
                      width: `${((zoomScale - 0.5) / 1.5) * 100}%`,
                    },
                  ]}
                />
              </View>

              <Pressable
                onPress={() => handleSliderStep(0.1)}
                style={[styles.stepButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
              >
                <Text style={[styles.stepButtonText, { color: theme.TEXT }]}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          onPress={openFeedback}
          style={[styles.linkButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
        >
          <Text style={[styles.linkButtonText, { color: theme.TEXT }]}>Feedback</Text>
        </Pressable>

        <Pressable
          onPress={openBugReport}
          style={[styles.linkButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
        >
          <Text style={[styles.linkButtonText, { color: theme.TEXT }]}>Bug report</Text>
        </Pressable>

        <Pressable
          onPress={openRepo}
          style={[styles.linkButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
        >
          <View style={styles.linkButtonRow}>
            <View style={styles.linkButtonLeft}>
              <MaterialCommunityIcons name="github" size={18} color={theme.TEXT} />
              <Text style={[styles.linkButtonText, { color: theme.TEXT }]}>View source code</Text>
            </View>
            <MaterialCommunityIcons name="open-in-new" size={16} color={theme.TEXT_SECONDARY} />
          </View>
        </Pressable>

        <Text style={[styles.versionText, { color: theme.TEXT_SECONDARY }]}>{APP_VERSION_LABEL}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sliderRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  sliderTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
  },
  input: {
    width: 92,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  linkButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  linkButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  versionText: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});
